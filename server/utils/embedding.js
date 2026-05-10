const axios = require('axios');

const HF_API_KEY = process.env.HUGGING_FACE_API_KEY;
const MODEL_URL = 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';

/**
 * Generates a vector embedding for a given text.
 * Optimized for lightweight performance on Render free tier.
 * @param {string} text - The product title or description.
 * @returns {Promise<number[]>} - The vector array.
 */
const generateEmbedding = async (text) => {
    if (!text || !HF_API_KEY) return null;
    try {
        const response = await axios.post(
            MODEL_URL,
            { inputs: text },
            { 
                headers: { Authorization: `Bearer ${HF_API_KEY}` },
                timeout: 10000 
            }
        );

        // HF API returns the vector directly for this pipeline
        return response.data;
    } catch (err) {
        console.error('Embedding Generation Error:', err.response?.data || err.message);
        return null;
    }
};

module.exports = { generateEmbedding };
