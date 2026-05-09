import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exec } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    
    if (!query) {
      return NextResponse.json({ ok: false, error: "Query is required" }, { status: 400 });
    }

    // 1. Get proxy settings
    const settings = await prisma.globalSettings.findMany({
      where: { key: { in: ['proxy_host', 'proxy_port', 'proxy_username', 'proxy_password'] } }
    });
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as Record<string, string>);
    
    let proxyArg = "";
    if (config.proxy_host && config.proxy_port) {
      const isSocks = config.proxy_host.startsWith('socks') || config.proxy_port === '10800';
      const protocol = isSocks ? 'socks5' : 'http';
      let proxyStr = `${protocol}://`;
      if (config.proxy_username && config.proxy_password) {
        proxyStr += `${config.proxy_username}:${config.proxy_password}@`;
      }
      proxyStr += `${config.proxy_host.replace(/^(socks5:\/\/|http:\/\/)/, '')}:${config.proxy_port}`;
      proxyArg = `--proxy "${proxyStr}"`;
    }

    // 2. Run the Playwright search script
    const command = `node scripts/hltv_playwright.mjs ${proxyArg} --mode search --q "${query}"`;
    console.log(`[HLTV Search API] Running: ${command}`);

    const hltvEvents = await new Promise((resolve, reject) => {
      exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[HLTV Search API] Exec error: ${error}`);
          const msg = error.killed ? "Search timed out after 60s" : error.message;
          return reject(new Error(`Search failed: ${msg}`));
        }

        try {
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          const data = JSON.parse(lastLine);
          
          if (data.ok) {
            resolve(data.events);
          } else {
            reject(new Error(`HLTV Search Error: ${data.error}`));
          }
        } catch (e) {
          console.error(`[HLTV Search API] Parse error. Stdout: ${stdout}`);
          reject(new Error("Failed to parse search output"));
        }
      });
    });

    return NextResponse.json({ ok: true, results: hltvEvents });
  } catch (error: any) {
    console.error('[HLTV Search API] Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
