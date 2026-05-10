const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');
const axios = require('axios');
const { generateEmbedding } = require('../utils/embedding');

// ─────────────────────────────────────────────
// Cloudinary upload helper
// ─────────────────────────────────────────────
const uploadToCloudinary = (buffer, mimetype) =>
  new Promise((resolve, reject) => {
    const resourceType = mimetype?.startsWith('video') ? 'video' : 'image';

    const stream = cloudinary.uploader.upload_stream(
      { folder: 'campuscart', resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );


    stream.end(buffer);
  });

// ─────────────────────────────────────────────
// Extract Cloudinary ID
// ─────────────────────────────────────────────
const extractPublicId = (url) => {
  try {
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return null;

    return parts
      .slice(uploadIndex + 1)
      .join('/')
      .replace(/\.[^/.]+$/, '')
      .replace(/^v\d+\//, '');
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────
// Delete from Cloudinary
// ─────────────────────────────────────────────
const deleteFromCloudinary = async (urls = []) => {
  const ids = urls.map(extractPublicId).filter(Boolean);
  await Promise.allSettled(ids.map((id) => cloudinary.uploader.destroy(id)));
};

// ============================================================
// GET ALL PRODUCTS
// ============================================================
exports.getProducts = async (req, res) => {
  try {
    const { search, category } = req.query;

    const query = { status: { $ne: 'sold' } };

    if (search) query.title = { $regex: search, $options: 'i' };
    if (category && category !== 'All') query.category = category;

    const products = await Product.find(query)
      .populate('sellerId', 'name email phone avatar ratingAvg ratingCount')
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server Error' });
  }
};

// ============================================================
// GET PRODUCT BY ID
// ============================================================
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('sellerId', 'name email phone avatar ratingAvg ratingCount');

    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server Error' });
  }
};

// ============================================================
// CREATE PRODUCT
// ============================================================
exports.createProduct = async (req, res) => {
  try {
    const { title, description, price, category, pickupLocation } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ msg: 'Upload at least one image' });
    }

    const imageUrls = await Promise.all(
      req.files.map((f) => uploadToCloudinary(f.buffer, f.mimetype))
    );

    const product = new Product({
      title,
      description,
      price,
      category,
      pickupLocation,
      images: imageUrls,
      sellerId: req.user.id,
      embeddings: await generateEmbedding(`${title} ${description}`)
    });

    const saved = await product.save();
    res.json(saved);

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
};

// ============================================================
// UPDATE PRODUCT
// ============================================================
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ msg: 'Not found' });

    if (String(product.sellerId) !== String(req.user.id)) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    const update = {
      title: req.body.title ?? product.title,
      description: req.body.description ?? product.description,
      price: req.body.price ?? product.price,
      category: req.body.category ?? product.category,
      pickupLocation: req.body.pickupLocation ?? product.pickupLocation,
    };

    if (req.body.title || req.body.description) {
      update.embeddings = await generateEmbedding(`${update.title} ${update.description}`);
    }

    if (req.files?.length > 0) {
      await deleteFromCloudinary(product.images);

      update.images = await Promise.all(
        req.files.map((f) => uploadToCloudinary(f.buffer, f.mimetype))
      );
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, update, {
      new: true
    });

    res.json(updated);

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server Error' });
  }
};

// ============================================================
// DELETE PRODUCT
// ============================================================
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ msg: 'Not found' });

    if (String(product.sellerId) !== String(req.user.id)) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await deleteFromCloudinary(product.images);
    await product.deleteOne();

    res.json({ msg: 'Deleted' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server Error' });
  }
};

// ============================================================
// MY PRODUCTS
// ============================================================
exports.getMyProducts = async (req, res) => {
  try {
    const products = await Product.find({ sellerId: req.user.id })
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server Error' });
  }
};

// ============================================================
// AI DESCRIPTION GENERATOR — IMPROVED
// ============================================================
// The old api-inference.huggingface.co is deprecated (returns 404).
// Using the new HF Router with Kimi VLM for high-quality descriptions.
// Primary: Kimi-K2.5 (faster) | Fallback: Kimi-K2.6
const HF_API_KEY = process.env.HUGGING_FACE_API_KEY;

const HF_PROVIDERS = [
  { url: 'https://router.huggingface.co/together/v1/chat/completions', model: 'moonshotai/Kimi-K2.5', name: 'together/K2.5' },
  { url: 'https://router.huggingface.co/together/v1/chat/completions', model: 'moonshotai/Kimi-K2.6', name: 'together/K2.6' },
];

// ── Expanded category map for campus products ─────────────────
const categoryMap = {
  // Books
  'book': 'Books', 'textbook': 'Books', 'novel': 'Books',
  'guide': 'Books', 'manual': 'Books', 'edition': 'Books',
  // Electronics
  'phone': 'Electronics', 'laptop': 'Electronics', 'computer': 'Electronics',
  'headphone': 'Electronics', 'headphones': 'Electronics',
  'speaker': 'Electronics', 'tablet': 'Electronics', 'camera': 'Electronics',
  'earphone': 'Electronics', 'earbuds': 'Electronics', 'charger': 'Electronics',
  'keyboard': 'Electronics', 'mouse': 'Electronics', 'monitor': 'Electronics',
  'mobile': 'Electronics', 'iphone': 'Electronics', 'samsung': 'Electronics',
  'adapter': 'Electronics', 'cable': 'Electronics', 'usb': 'Electronics',
  // Clothing
  'shirt': 'Clothing', 'pants': 'Clothing', 'jeans': 'Clothing',
  'dress': 'Clothing', 'jacket': 'Clothing', 'coat': 'Clothing',
  'shoe': 'Clothing', 'shoes': 'Clothing', 'uniform': 'Clothing',
  'hoodie': 'Clothing', 'saree': 'Clothing', 'kurta': 'Clothing',
  // Hostel
  'bed': 'Hostel', 'chair': 'Hostel', 'desk': 'Hostel',
  'lamp': 'Hostel', 'table': 'Hostel', 'bedsheet': 'Hostel',
  'pillow': 'Hostel', 'mattress': 'Hostel', 'cushion': 'Hostel',
  // Sports
  'ball': 'Sports', 'racket': 'Sports', 'bat': 'Sports',
  'yoga': 'Sports', 'cricket': 'Sports', 'football': 'Sports',
  'badminton': 'Sports', 'bicycle': 'Sports', 'skateboard': 'Sports',
  // Stationery
  'notebook': 'Stationery', 'pen': 'Stationery', 'pencil': 'Stationery',
  'paper': 'Stationery', 'ruler': 'Stationery', 'eraser': 'Stationery',
  // Lab
  'microscope': 'Lab', 'calculator': 'Lab', 'compass': 'Lab',
  'scale': 'Lab', 'beaker': 'Lab', 'flask': 'Lab',
};

const detectCategory = (description) => {
  const lower = description.toLowerCase();
  for (const key in categoryMap) {
    if (lower.includes(key)) return categoryMap[key];
  }
  return 'Others';
};

// ── VLM prompt engineered for campus marketplace descriptions ──
const VLM_PROMPT = `You are writing a product listing for CampusCart, a college campus marketplace where students buy and sell used items.

Look at this image and write a 1-2 sentence product description. Include:
- What the item is (be specific — e.g. "GATE exam preparation book" not just "a book")
- Color or appearance
- Apparent condition (new, used, good condition, slightly worn, etc.)
- Brand name if visible
- Any notable features

Examples of GOOD descriptions:
- "Used GATE exam preparation book by Made Easy, in good condition with some highlighting on pages."
- "Black Sony WH-1000XM4 wireless headphones with carrying case, lightly used."
- "Blue denim jeans, waist 32, barely worn, no stains or tears."

Be specific and helpful. Do NOT say "a product image" or anything generic. Do NOT include any reasoning, thinking, or explanation — just the description.`;

// ── Call VLM with fallback across providers ─────────────────────
async function callVLM(imageUrl) {
  let lastError = null;

  for (const provider of HF_PROVIDERS) {
    try {
      console.log(`[AI] Trying ${provider.name}...`);
      const response = await axios.post(
        provider.url,
        {
          model: provider.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: VLM_PROMPT },
                { type: 'image_url', image_url: { url: imageUrl } }
              ]
            }
          ],
          // Kimi is a thinking model: uses ~500-1000 tokens on reasoning
          // before generating content. Must be high enough for both.
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      const content = (response.data?.choices?.[0]?.message?.content || '').trim();

      // Reject generic / empty descriptions — try next provider
      if (!content || content.length < 10 || /^a product/i.test(content)) {
        throw new Error('Description too generic, trying next provider');
      }

      console.log(`[AI] ${provider.name} succeeded: "${content.substring(0, 80)}..."`);
      return { description: content, provider: provider.name };
    } catch (err) {
      console.warn(`[AI] ${provider.name} failed:`, err.response?.data?.error || err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All providers failed');
}

// ============================================================
// POST /api/products/generate-description
// ============================================================
exports.generateDescription = async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ msg: 'imageUrl is required' });
    }

    if (!HF_API_KEY) {
      return res.status(500).json({
        msg: 'AI service not configured. Please add HUGGING_FACE_API_KEY to environment.',
        fallback: true
      });
    }

    const { description, provider } = await callVLM(imageUrl);
    const suggestedCategory = detectCategory(description);

    res.json({
      description,
      category: suggestedCategory,
      confidence: 'high',
      model: provider
    });

  } catch (err) {
    console.error('generateDescription error:', err.response?.data || err.message);

    if (err.response?.status === 503) {
      return res.status(503).json({
        msg: 'AI model is loading, please try again in ~20 seconds.',
        error: 'Model loading',
        fallback: true
      });
    }

    res.status(500).json({
      msg: 'Could not generate description. Please write it manually.',
      error: err.response?.data?.error?.message || err.response?.data?.error || err.message,
      fallback: true
    });
  }
};