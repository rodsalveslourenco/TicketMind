import QRCode from "qrcode";

export async function toQrCodeDataUrl(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return "";
  return QRCode.toDataURL(normalizedValue, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: {
      dark: "#14324b",
      light: "#ffffffff",
    },
  });
}
