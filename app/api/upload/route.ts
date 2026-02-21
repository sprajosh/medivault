import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";

const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 10;

interface UploadResult {
  thumbnail_file_id: string;
  full_res_file_id: string;
  fileName: string;
}

async function uploadToTelegram(file: File, BOT_TOKEN: string, CHAT_ID: string): Promise<UploadResult> {
  const isVideo = file.type.startsWith("video/");
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const formDataToSend = new FormData();
  const blob = new Blob([buffer], { type: file.type });
  formDataToSend.append("chat_id", CHAT_ID);
  
  if (isVideo) {
    formDataToSend.append("video", blob, file.name);
  } else {
    formDataToSend.append("photo", blob, file.name);
  }

  const endpoint = isVideo
    ? `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`
    : `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;

  const telegramResponse = await fetch(endpoint, {
    method: "POST",
    body: formDataToSend,
  });

  const telegramResult = await telegramResponse.json();

  if (!telegramResult.ok) {
    throw new Error(`Telegram error: ${telegramResult.description || "Unknown error"}`);
  }

  let thumbnailFileId: string;
  let fullResFileId: string;

  if (isVideo) {
    thumbnailFileId = telegramResult.result.video.thumbnail?.file_id || "";
    fullResFileId = telegramResult.result.video.file_id;
  } else {
    const photos = telegramResult.result.photo;
    thumbnailFileId = photos[1]?.file_id || photos[0].file_id;
    fullResFileId = photos[photos.length - 1].file_id;
  }

  return {
    thumbnail_file_id: thumbnailFileId,
    full_res_file_id: fullResFileId,
    fileName: file.name,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Get token from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized: No token provided" }, { status: 401 });
    }
    
    const idToken = authHeader.split("Bearer ")[1];
    
    // Verify the token
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

    // Get all files from formData
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files. Maximum is ${MAX_FILES}` },
        { status: 400 }
      );
    }

    // Validate all files first
    for (const file of files) {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type for ${file.name}. Allowed: JPEG, PNG, WebP, MP4, WebM` },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name}. Maximum size is 50MB` },
          { status: 400 }
        );
      }
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return NextResponse.json(
        { error: "Telegram bot not configured" },
        { status: 500 }
      );
    }

    // Upload all files
    const results: UploadResult[] = [];
    for (const file of files) {
      const result = await uploadToTelegram(file, BOT_TOKEN, CHAT_ID);
      results.push(result);
    }

    return NextResponse.json({ files: results });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Upload failed", details: message },
      { status: 500 }
    );
  }
}
