const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/embedding');
const axios = require('axios');

const HF_API_KEY = process.env.HUGGING_FACE_API_KEY;
const MODEL_URL = 'https://router.huggingface.co/together/v1/chat/completions';
const MODEL_NAME = 'moonshotai/Kimi-K2.5';

const SYSTEM_PROMPT = `
### Role
You are the "CampusCart Semantic Search Intelligence." Your task is to act as a bridge between messy student search queries and a high-precision Vector Database.

### Context
CampusCart is a student-to-student marketplace. Users often use slang, vague terms (e.g., "dorm vibes"), or specific academic needs (e.g., "viva prep") rather than technical product names.

### Objectives
1. **Semantic Expansion:** Convert the user's query into a rich, descriptive paragraph that captures the *intent* and *context* of the item.
2. **Constraint Extraction:** Identify implicit filters like price sensitivity (e.g., "cheap"), urgency (e.g., "fast"), or condition (e.g., "like new").
3. **Category Mapping:** Map the query to the most relevant campus category (Electronics, Furniture, Books, Lab Gear, Clothing).

### Output Protocol (Strict JSON)
Generate a JSON object with the following keys:
- search_vector_input: A 2-3 sentence descriptive string optimized for an embedding model.
- filters: An object containing max_price, condition, and category_guess.
- user_intent: A brief summary of what the student is actually looking for.

### Guardrails
- If the query is unrelated to a campus marketplace, return: {"error": "Out of scope"}.
- Do not hallucinate specific product names that don't exist; focus on attributes.
- Use "Student Persona" logic: if they search "First Year Engineering," assume they need calculators, drafters, or specific textbooks.
`;

exports.semanticSearch = async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ msg: 'Query is required' });
        }

        if (!HF_API_KEY) {
            return res.status(500).json({ msg: 'AI service not configured' });
        }

        // 1. Semantic Expansion using Intelligence Persona
        const aiResponse = await axios.post(
            MODEL_URL,
            {
                model: MODEL_NAME,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: query }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 1000
            },
            {
                headers: {
                    'Authorization': `Bearer ${HF_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const expansion = JSON.parse(aiResponse.data.choices[0].message.content);

        if (expansion.error) {
            return res.json({ msg: expansion.error, products: [] });
        }

        // 2. Vectorize the expanded text
        const vector = await generateEmbedding(expansion.search_vector_input);

        if (!vector) {
            return res.status(500).json({ msg: 'Failed to generate search vector' });
        }

        // 3. Atlas Vector Search
        // IMPORTANT: Requires a Vector Search index named "default" on the products collection
        const products = await Product.aggregate([
            {
                $vectorSearch: {
                    index: "default",
                    path: "embeddings",
                    queryVector: vector,
                    numCandidates: 100,
                    limit: 12
                }
            },
            {
                $match: {
                    status: "available"
                }
            },
            {
                $project: {
                    embeddings: 0,
                    score: { $meta: "vectorSearchScore" }
                }
            }
        ]);

        res.json({
            expansion,
            products
        });

    } catch (err) {
        console.error('Semantic Search Error:', err.response?.data || err.message);
        res.status(500).json({ msg: 'Semantic search failed', error: err.message });
    }
};
