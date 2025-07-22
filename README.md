# Redactify

Redactify is a web application for redacting sensitive information from PDF documents. It is built with **Next.js** and **TypeScript** and styled using **Tailwind CSS** and components from [shadcn/ui](https://ui.shadcn.com/). 

## Features

- **PDF Upload** – drag and drop or select a PDF file to begin.
- **Manual redaction** – click and drag to highlight areas that should be redacted.
- **Undo, clear and reset** – manage redaction boxes before finalising the document.
- **Download options** – export either a _recoverable_ or _secure_ flattened PDF.

- ![image](https://github.com/user-attachments/assets/440c275f-61aa-4b80-9525-fd4fa51f91d7)
- ![image](https://github.com/user-attachments/assets/c86d5eeb-9b07-486f-91b7-aa8327ca8f6f)
- ![image](https://github.com/user-attachments/assets/bc72b809-a48c-495c-8a32-9d58bc68a6bb)




## Project structure

```
src/
  app/               # Next.js app router entry points
  components/        # UI components including the RedactionTool
  hooks/             # Custom React hooks
  lib/               # Utility helpers
  middleware.ts      # Request logging
```

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
   The app runs on **localhost:9002** by default.
3. Lint and type‑check the project:
   ```bash
   npm run lint
   npm run typecheck
   ```
4. Build for production:
   ```bash
   npm run build
   npm start
   ```

## Logging

The application includes a middleware that logs every incoming request to the console. The logs are structured as JSON for easier parsing and analysis.

Example log entry:
```json
{
  "message": "User access",
  "timestamp": "2025-07-22T16:35:37.968Z",
  "ip": "::1",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  "geo": {
    "city": "Mountain View",
    "country": "US",
    "region": "CA"
  }
}
```

To persist these logs, you can redirect the console output to a file when starting the application:
```bash
npm start > access.log 2>&1
```

## License

This project is released under the [MIT License](LICENSE).

For support email vibecoder01+redactify@gmail.com
