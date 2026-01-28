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
      <body>{children}</body>
    </html>
  )
}
