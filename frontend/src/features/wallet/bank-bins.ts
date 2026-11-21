/** Ngân hàng theo mã BIN NAPAS (PayOS trả `bin` của tài khoản nhận) */
const BANKS: Record<string, { shortName: string; name: string }> = {
  '970422': { shortName: 'MB', name: 'Ngân hàng TMCP Quân đội' },
  '970436': { shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  '970415': { shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  '970418': { shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  '970405': { shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn' },
  '970407': { shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  '970416': { shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  '970432': { shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  '970423': { shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  '970403': { shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  '970437': { shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh' },
  '970441': { shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  '970443': { shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn – Hà Nội' },
  '970440': { shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  '970448': { shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  '970426': { shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  '970431': { shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  '970449': { shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
}

/** "970422" → { shortName: 'MB', name: 'Ngân hàng TMCP Quân đội' }; BIN lạ thì hiện chính mã BIN */
export const bankOfBin = (bin: string) => BANKS[bin] ?? { shortName: `BIN ${bin}`, name: `Ngân hàng (mã ${bin})` }
