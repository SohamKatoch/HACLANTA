import "./globals.css";

export const metadata = {
  title: "Driver Safety Monitor",
  description: "Webcam feature extraction + Flask drowsiness scoring"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
