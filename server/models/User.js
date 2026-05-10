const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    phone: {
        type: String,
        required: true
    },

    department: {
  type: String,
  trim: true,
  default: ""
},

    year: {
        type: String,
        enum: ["First Year", "Second Year", "Third Year", "Final Year"],
        required: true
    },
    password: {
        type: String,
        required: true
    },

    isAdmin: {
        type: Boolean,
        default: false
    },

    isBlocked: {
        type: Boolean,
        default: false
    },

    avatar: {
        type: String,
        default: ""
    },

    ratingAvg: {
        type: Number,
        default: 0
    },

    ratingCount: {
        type: Number,
        default: 0
    },

    wishlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],

    prn: {
        type: Number,
        unique: true,
        sparse: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});


// Password hashing middleware
UserSchema.pre('save', async function() {
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});


UserSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};


module.exports = mongoose.model('User', UserSchema);