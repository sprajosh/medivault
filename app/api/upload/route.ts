import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return NextResponse.json(
        { error: "Telegram bot not configured" },
        { status: 500 }
      );
    }

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
      console.error("Telegram API error:", telegramResult);
      return NextResponse.json(
        { error: "Failed to upload to Telegram" },
        { status: 500 }
      );
    }

    let thumbnailFileId: string;
    let fullResFileId: string;

    if (isVideo) {
      thumbnailFileId = telegramResult.result.video.thumbnail?.file_id || "";
      fullResFileId = telegramResult.result.video.file_id;
    } else {
      const photos = telegramResult.result.photo;
      thumbnailFileId = photos[0].file_id;
      fullResFileId = photos[photos.length - 1].file_id;
    }

    return NextResponse.json({
      thumbnail_file_id: thumbnailFileId,
      full_res_file_id: fullResFileId,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
