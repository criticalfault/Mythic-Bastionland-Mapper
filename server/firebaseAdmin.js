const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.warn('\n⚠  WARNING: server/service-account.json not found.');
  console.warn('   Firebase features (auth verification, Firestore saves) will be disabled.');
  console.warn('   Download your service account key from Firebase Console → Project Settings → Service Accounts\n');
  module.exports = null;
} else {
  const serviceAccount = require('./service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  module.exports = admin;
}
