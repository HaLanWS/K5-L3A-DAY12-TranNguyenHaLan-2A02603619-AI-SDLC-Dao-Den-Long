# Báo cáo Tổng kết & Đánh giá Dự án (Retrospective)

## 1. Tổng quan 4 Phase
- **Phase 1 (PRD-0 · Contract v1.0):** Xây dựng nền tảng Đảo Bến, tách rời simulation 60 tick/giây tất định (`Mulberry32`) khỏi Three.js.
- **Phase 2 (Ticket-02 · Contract v1.1):** Chuẩn hóa số liệu điều khiển (Lướt 14 m/s, Nhảy, Rơi), mở rộng 3 hòn đảo (Đảo Bến, Đảo Cau, Đảo Chuông), thêm Gió Lạc và Bùa Gió.
- **Phase 3 (Ticket-03 · Contract v1.2):** Xử lý Change Request "Đèn Cạn Dầu", luật nhiên liệu `fuel`, Bóng Mực hút dầu `drain`, luật thắng mới `dawn_survived`.
- **Phase 4 (Ticket-04 · Contract v1.3):** Benchmark (avg_fps 88.5 >= 60), Soak test (10 đêm, 0 crash, mem leak < 1.2x), Bảng xếp hạng, đóng gói và phát hành `v1.0.0`.

## 2. Kinh nghiệm làm việc cùng AI & Quản lý Token
- **Harness hiệu quả nhất:**
  - `AGENTS.md` cố định thứ tự 12 bước trong tick và danh sách trạng thái thực thể.
  - `scripts/hook-guard.mjs` bảo vệ bất biến kiến trúc (không phụ thuộc DOM hay Math.random trong core).
  - Vitest + script verify tự động tạo bằng chứng thật.
- **Tổng token ước tính:** ~140K token cho toàn bộ 4 Phase. Tiết kiệm nhờ giao tiếp ngắn gọn, bám sát test contract, không code vòng vo.
