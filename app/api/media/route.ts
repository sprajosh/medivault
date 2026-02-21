import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Verify the token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized: No token provided" }, { status: 401 });
    }
    
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
    }

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
      // Telegram returns "FILE_ID_INVALID" for invalid file IDs
      const isNotFound = fileData.description?.includes("FILE_ID_INVALID");
      return NextResponse.json(
        { error: isNotFound ? "File not found" : "Failed to get file from Telegram" },
        { status: isNotFound ? 404 : 500 },
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
