import { randomUUID } from "node:crypto";  // ✅ Use randomUUID (not UUID)
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {v4 as uuid} from "uuid";  
const client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  try {
    const {  fileType:mime } = await req.json();

    // ✅ Generate unique filename: UUID + original extension
    const filename = uuid()
    const key = `uploads/${filename}.${mime}`;  // Organized path + unique name

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: key,  // Use generated key
      ContentType: mime,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 3600 });

    // ✅ Return both original filename and S3 key for frontend storage
    return NextResponse.json({ 
      url, 
      key, 
      Filename: filename 
    });
  } catch (error) {
    console.error('Presigned URL error:', error);
    return NextResponse.json({ 
      error: "Failed to generate presigned URL" 
    }, { status: 500 });
  }
}
