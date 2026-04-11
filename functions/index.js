const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { v2: cloudinary } = require('cloudinary');

const CLOUDINARY_API_KEY    = defineSecret('CLOUDINARY_API_KEY');
const CLOUDINARY_API_SECRET = defineSecret('CLOUDINARY_API_SECRET');

exports.cloudinarySignature = onCall(
  { secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }
    const timestamp = Math.round(Date.now() / 1000);
    const folder    = 'motus-videos';
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      CLOUDINARY_API_SECRET.value()
    );
    return {
      signature,
      timestamp,
      folder,
      cloudName: 'dslbugsdg',
      apiKey: CLOUDINARY_API_KEY.value(),
    };
  }
);
