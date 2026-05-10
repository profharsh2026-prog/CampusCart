const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('./models/Product');
const { generateEmbedding } = require('./utils/embedding');

dotenv.config();

/**
 * BACKFILL SCRIPT
 * This script iterates through all products that are missing embeddings
 * and generates them using the Hugging Face API.
 */
const backfill = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected ✅');

    // 1. Find products that don't have embeddings yet
    const products = await Product.find({
      $or: [
        { embeddings: { $exists: false } },
        { embeddings: { $size: 0 } }
      ]
    });

    console.log(`Found ${products.length} products needing embeddings.`);

    if (products.length === 0) {
      console.log('Nothing to do. All products already have embeddings!');
      process.exit(0);
    }

    // 2. Process them one by one (to avoid hitting API rate limits)
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`[${i + 1}/${products.length}] Generating for: "${product.title}"...`);

      const textToEmbed = `${product.title} ${product.description}`;
      const vector = await generateEmbedding(textToEmbed);

      if (vector) {
        product.embeddings = vector;
        await product.save();
        console.log(`   ✅ Success`);
      } else {
        console.log(`   ❌ Failed (Check your HF_API_KEY)`);
      }

      // Add a tiny delay to be safe with rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\nAll products updated successfully! 🚀');
    process.exit(0);

  } catch (err) {
    console.error('Backfill Error:', err.message);
    process.exit(1);
  }
};

backfill();
