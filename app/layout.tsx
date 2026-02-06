import "./globals.css";

export const metadata = {
  title: 'MaryJane Hub - Document Processing',
  description: 'Document AI processing and QuickBooks integration',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@400"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
