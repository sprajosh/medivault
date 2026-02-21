import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

    const formData = await request.formData();
    const fileIds = formData.getAll("file_ids") as string[];

    if (!fileIds || fileIds.length === 0) {
      return NextResponse.json({ error: "file_ids required" }, { status: 400 });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    if (!BOT_TOKEN) {
      return NextResponse.json(
        { error: "Telegram bot not configured" },
        { status: 500 },
      );
    }

    // Fetch all file URLs in parallel
    const results = await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const getFileResponse = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`,
          );
          const fileData = await getFileResponse.json();

          if (!fileData.ok) {
            return { fileId, url: null, error: "Failed to get file" };
          }

          const filePath = fileData.result.file_path;
          const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
          return { fileId, url: fileUrl, error: null };
        } catch {
          return { fileId, url: null, error: "Error fetching file" };
        }
      })
    );

    return NextResponse.json({ files: results });
  } catch (error) {
    console.error("Batch media fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
