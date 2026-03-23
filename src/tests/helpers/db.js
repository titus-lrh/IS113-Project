'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

// Use TEST_MONGODB_URI if set, otherwise inject 'is113_test' as the DB path segment.
// Atlas SRV URIs often have no database in the path (e.g. .../...net/?appName=X),
// so a simple string replace on DB_NAME would hit the wrong token.
const baseUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/is113_db';
const TEST_URI = process.env.TEST_MONGODB_URI ||
  baseUri.replace(/\/(\?|$)/, '/is113_test$1');

async function connect() {
  await mongoose.connect(TEST_URI);
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect };
