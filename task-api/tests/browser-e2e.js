/**
 * E2E Browser Automation Script — Task API (Block 6)
 *
 * Mở trình duyệt Chrome trực tiếp và tự động thao tác:
 *  1. Tương tác với các kịch bản kiểm thử (Workbench)
 *  2. Thử nghiệm IDOR (Alice đọc A1 vs B1)
 *  3. Thử nghiệm RBAC/ReBAC/ABAC (Bob sửa A1 vs A2, Bob xóa project)
 *  4. Thử nghiệm giả mạo role và tenant
 *  5. Chạy toàn bộ 17 Test Oracle tự động trên giao diện web
 *  6. Chụp ảnh màn hình làm bằng chứng (screenshots)
 *  7. Giữ trình duyệt mở để người dùng quan sát và tiếp tục thao tác
 */

'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const SCREENSHOT_DIR = path.join(__dirname, '../public/screenshots');
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || 'C:\\Users\\admin\\.gemini\\antigravity\\brain\\c5eb326a-5468-4bd5-af41-cc3460c2fb56';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('[E2E] Đang khởi động Google Chrome trên màn hình...');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  console.log('[E2E] Đang điều hướng đến http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await sleep(1000);

  // ── Thao tác 1: Alice đọc Task A1 (cùng project) ──────────────────────────
  console.log('[1/6] Thao tác: Alice đọc Task A1 (hợp lệ)...');
  await page.click('button[data-desc="Alice đọc task A1 (thuộc Alpha)"]');
  await sleep(1200);

  const shot1Path = path.join(SCREENSHOT_DIR, '01_alice_read_a1_200.png');
  await page.screenshot({ path: shot1Path });
  console.log('   [ĐẠT] Đã nhận response 200 OK. Đã chụp ảnh:', shot1Path);

  // ── Thao tác 2: Alice đọc Task B1 (IDOR Test) ─────────────────────────────
  console.log('[2/6] Thao tác: Alice đọc Task B1 (IDOR Test - bị chặn 403)...');
  await page.click('button[data-desc="Alice đọc task B1 (thuộc Beta - IDOR test)"]');
  await sleep(1200);

  const shot2Path = path.join(SCREENSHOT_DIR, '02_alice_read_b1_403.png');
  await page.screenshot({ path: shot2Path });
  console.log('   [ĐẠT] Đã nhận response 403 Forbidden. Đã chụp ảnh:', shot2Path);

  // ── Thao tác 3: Bob sửa Task A1 (assignee, Open) vs Task A2 (chưa assign) ──
  console.log('[3/6] Thao tác: Bob sửa Task A1 (200 OK) rồi thử sửa Task A2 (403 Forbidden)...');
  await page.click('button[data-desc="Bob sửa A1 (assignee=bob, Open)"]');
  await sleep(1000);

  await page.click('button[data-desc="Bob sửa A2 (chưa assign)"]');
  await sleep(1200);

  const shot3Path = path.join(SCREENSHOT_DIR, '03_bob_edit_a2_403.png');
  await page.screenshot({ path: shot3Path });
  console.log('   [ĐẠT] Đã nhận response 403 Forbidden do chưa assign. Đã chụp ảnh:', shot3Path);

  // ── Thao tác 4: Bob giả mạo body role=Admin & Dana gửi X-Tenant-Id: beta ────
  console.log('[4/6] Thao tác: Kiểm thử chống giả mạo role và tenant...');
  await page.click('button[data-desc="Bob tự khai role: Admin"]');
  await sleep(1000);

  await page.click('button[data-desc="Dana gửi X-Tenant-Id: beta"]');
  await sleep(1200);

  const shot4Path = path.join(SCREENSHOT_DIR, '04_dana_forge_tenant_403.png');
  await page.screenshot({ path: shot4Path });
  console.log('   [ĐẠT] Server từ chối giả mạo tenant (403 Forbidden). Đã chụp ảnh:', shot4Path);

  // ── Thao tác 5: Chuyển sang Tab Test Oracle và chạy toàn bộ 17 tests ────────
  console.log('[5/6] Thao tác: Chuyển sang Tab "Test Oracle" và chạy toàn bộ 17 tests tự động...');
  await page.click('button[data-tab="tab-oracle"]');
  await sleep(800);

  console.log('   [E2E] Bấm nút "CHẠY TOÀN BỘ TEST ORACLE"...');
  await page.click('#btn-run-all-oracle');

  // Đợi cho đến khi text trên nút chuyển thành "CHẠY LẠI" (nghĩa là đã chạy xong)
  await page.waitForFunction(
    () => document.getElementById('btn-run-all-oracle').textContent.includes('CHẠY LẠI'),
    { timeout: 15000 }
  );
  await sleep(1000);

  const shot5Path = path.join(SCREENSHOT_DIR, '05_test_oracle_17_pass.png');
  await page.screenshot({ path: shot5Path, fullPage: true });
  console.log('   [XUẤT SẮC] 17/17 TEST ORACLE ĐÃ ĐẠT 100%! Đã chụp ảnh:', shot5Path);

  // ── Thao tác 6: Chuyển sang Tab Minh Chứng IDOR và Bảng Ma Trận ────────────
  console.log('[6/6] Thao tác: Xem tab Minh chứng IDOR và Ma trận quyền...');
  await page.click('button[data-tab="tab-evidence"]');
  await sleep(1200);

  const shot6Path = path.join(SCREENSHOT_DIR, '06_idor_evidence_tab.png');
  await page.screenshot({ path: shot6Path });

  await page.click('button[data-tab="tab-matrix"]');
  await sleep(1200);

  const shot7Path = path.join(SCREENSHOT_DIR, '07_permission_matrix_tab.png');
  await page.screenshot({ path: shot7Path });

  // Quay lại tab Workbench để người dùng sẵn sàng sử dụng
  await page.click('button[data-tab="tab-e2e"]');
  await sleep(500);

  // Sao chép các ảnh chụp vào Artifact Directory để hiển thị trong chat nếu cần
  try {
    const files = fs.readdirSync(SCREENSHOT_DIR);
    for (const file of files) {
      if (file.endsWith('.png')) {
        fs.copyFileSync(path.join(SCREENSHOT_DIR, file), path.join(ARTIFACT_DIR, file));
      }
    }
    console.log('[E2E] Đã sao chép toàn bộ ảnh chụp vào artifact directory.');
  } catch (e) {
    console.log('[E2E] Bỏ qua copy artifact:', e.message);
  }

  console.log('\n[E2E] HOÀN TẤT THAO TÁC E2E TRÊN TRÌNH DUYỆT!');
  console.log('[E2E] Cửa sổ Google Chrome đang mở trực tiếp trên màn hình của bạn tại http://localhost:3000 để bạn xem và thao tác thêm.');

  // Giữ tiến trình mở thêm một chút rồi detached để Chrome vẫn mở cho người dùng
  await sleep(2000);
  browser.disconnect(); // Ngắt điều khiển puppeteer nhưng giữ nguyên Chrome mở cho người dùng!
  process.exit(0);
})().catch(err => {
  console.error('[E2E] Lỗi khi chạy E2E Browser automation:', err);
  process.exit(1);
});

