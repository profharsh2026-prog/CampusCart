const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({

    title: {
        type: String,
        required: true,
        trim: true
    },

    description: {
        type: String,
        required: true,
        trim: true
    },

    price: {
        type: Number,
        required: true,
        min: 0
    },

    category: {
        type: String,
        required: true,
        enum: [
            'Books',
            'Electronics',
            'Hostel',
            'Clothing',
            'Lab',
            'Sports',
            'Others'   // ✅ Fixed (matches your new system)
        ]
    },

    images: [
        {
            type: String,
            required: true
        }
    ],

    pickupLocation: {
        type: String,
        trim: true
    },

    // ❌ You said you DON'T want this anymore
    // so keeping optional (or you can remove completely)
    contactPreference: {
        type: String,
        default: ''
    },

    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    status: {
        type: String,
        enum: ['available', 'sold'],
        default: 'available'
    },

    soldTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    embeddings: {
        type: [Number],
        default: []
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

module.exports = mongoose.model('Product', ProductSchema);