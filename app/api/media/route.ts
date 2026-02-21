import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("file_id");

    if (!fileId) {
      return NextResponse.json({ error: "file_id required" }, { status: 400 });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!BOT_TOKEN) {
      return NextResponse.json(
        { error: "Telegram bot not configured" },
        { status: 500 },
      );
    }

    const getFileResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`,
    );

    const fileData = await getFileResponse.json();

    if (!fileData.ok) {
      console.error("Telegram getFile error:", fileData);
      return NextResponse.json(
        { error: "Failed to get file from Telegram" },
        { status: 500 },
      );
    }

    const filePath = fileData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const response = NextResponse.json({ url: fileUrl });
    response.headers.set(
      "Cache-Control",
      "public, max-age=2700, s-maxage=2700",
    );

    return response;
  } catch (error) {
    console.error("Media fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
