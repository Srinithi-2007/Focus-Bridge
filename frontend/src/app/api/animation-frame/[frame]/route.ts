import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TOTAL_FRAMES = 80;

function resolveAssetDir(): string {
  const candidates = [
    path.resolve(process.cwd(), '../../Animation background'),
    path.resolve(process.cwd(), '../Animation background'),
    path.resolve(process.cwd(), 'Animation background'),
    'C:/Users/Srinithi/OneDrive/Desktop/DISAPPEAR/Ricoz/FocusBridge/Animation background',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return candidates[0];
}

const assetDir = resolveAssetDir();

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ frame: string }> }
) {
  const { frame } = await context.params;
  const num = parseInt(frame, 10);
  if (isNaN(num) || num < 0 || num >= TOTAL_FRAMES) {
    return new NextResponse('Frame not found', { status: 404 });
  }

  const frameStr = String(num).padStart(3, '0');
  const filename = `Butterflies_emerging_from_book_fc66a07c_${frameStr}.jpg`;
  const filePath = path.join(assetDir, filename);

  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Error loading frame', { status: 500 });
  }
}
