# ATS Resume & Cover Letter Generator

A production-ready web application that generates ATS-optimized resumes and tailored cover letters using AI. Paste a job description and your resume, and get professional documents ready for submission.

## ✨ Features

- **ATS-Optimized Resumes**: Rewrites your resume with job description keywords while maintaining ATS-friendly formatting
- **Tailored Cover Letters**: Generates personalized 3-4 paragraph cover letters aligned with job requirements
- **PDF Download**: Client-side PDF generation using html2pdf.js
- **Copy HTML**: Easily copy the generated HTML for use elsewhere
- **Sample Data**: Load sample JD/resume to test the app instantly
- **Responsive Design**: Works perfectly on mobile (320px+) and desktop
- **Smart Caching**: Caches results for 5 minutes to reduce API calls
- **Retry Logic**: Automatic retries with exponential backoff on API failures
- **Fallback Support**: Falls back from Groq to Google Gemini if primary fails

## 🛠️ Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **AI/LLM**: Groq API (llama3-70b-8192) with Google Gemini fallback
- **PDF Generation**: html2pdf.js (client-side)
- **Hosting**: Vercel-ready (serverless functions)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Free API key from [Groq](https://console.groq.com/keys) or [Google AI Studio](https://aistudio.google.com/app/apikey)

### Installation

1. **Clone or navigate to the project directory**
   ```bash
   cd ats-gen
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Copy the example env file and add your API keys:
   ```bash
   cp .env.local.example .env.local
   ```
   
   Edit `.env.local`:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   # Optional fallback:
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   
   Navigate to [https://kairesume.fit](https://kairesume.fit)

## 📖 Usage

1. **Paste Job Description**: Copy and paste the full job description into the first text area
2. **Paste Your Resume**: Paste your current resume text into the second text area
3. **Click Generate**: Wait for the AI to process (typically 5-15 seconds)
4. **Review Results**: Check the ATS-optimized resume and cover letter previews
5. **Download PDFs**: Click "Download PDF" for each document
6. **Optional - Copy HTML**: Use "Copy HTML" to get the raw HTML code

### Sample Data

Click "Load Sample Data" to instantly populate the form with example content for testing.

## 🏗️ Project Structure

```
ats-gen/
├── app/
│   ├── page.tsx                 # Main UI component
│   ├── layout.tsx              # Root layout with metadata
│   ├── globals.css             # Global styles
│   └── api/
│       └── generate/
│           └── route.ts        # API endpoint for generation
├── lib/
│   ├── llm.ts                  # LLM client (Groq + Gemini)
│   ├── prompts.ts              # ATS optimization prompt template
│   └── utils.ts                # Helper utilities
├── components/
│   ├── ResumePreview.tsx       # Preview + download component
│   └── LoadingSpinner.tsx      # Loading state component
├── public/
│   └── ats-template.html       # Reference template (optional)
├── .env.local.example          # Environment variable template
├── next.config.js              # Next.js configuration
├── tailwind.config.ts          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

## 🔑 API Keys

### Getting a Free Groq API Key

1. Visit [https://console.groq.com/keys](https://console.groq.com/keys)
2. Sign up or log in
3. Create a new API key
4. Copy the key to your `.env.local` file

Groq offers generous free tier limits suitable for development and personal use.

### Getting a Free Google Gemini API Key (Optional Fallback)

1. Visit [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key to your `.env.local` file

## 🌐 Deployment to Vercel

1. **Push to GitHub** (or connect directly in Vercel dashboard)

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Configure environment variables:
     - `GROQ_API_KEY`
     - `GEMINI_API_KEY` (optional)

3. **Deploy**
   - Click "Deploy"
   - Vercel will automatically build and deploy your app

4. **Production URL**
   - Your app will be live at `https://your-app.vercel.app`

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for LLM access |
| `GEMINI_API_KEY` | No | Google Gemini API key (fallback) |

### Model Settings

The app uses these default settings for deterministic output:
- **Model**: llama3-70b-8192 (Groq) / gemini-1.5-flash (fallback)
- **Max Tokens**: 2500
- **Temperature**: 0.3
- **Cache TTL**: 5 minutes

## 🎯 ATS Best Practices

The generated resumes follow these ATS guidelines:

✅ **Do:**
- Use standard section headings (Professional Summary, Skills, Experience, Education)
- Include exact keywords from the job description
- Use simple HTML formatting (`<h1>`, `<h2>`, `<p>`, `<ul>`, `<li>`)
- Quantify achievements with metrics
- Start bullet points with action verbs
- Use standard date formats (MMM YYYY – MMM YYYY)

❌ **Don't:**
- Use tables, columns, or complex layouts
- Include graphics, icons, or images
- Use headers/footers
- Keyword stuff unnaturally
- Use non-standard fonts or formatting

## 🐛 Troubleshooting

### "Failed to connect to AI service"
- Check your internet connection
- Verify your API key is correct in `.env.local`
- Ensure you haven't exceeded rate limits

### "Received invalid response from AI service"
- This can happen occasionally with LLMs
- Click "Generate" again to retry
- The app has built-in retry logic for transient errors

### PDF download not working
- Ensure pop-ups are allowed for https://kairesume.fit
- Try a different browser
- Check browser console for errors

### Build errors
```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
npm run build
```

### TypeScript errors
```bash
# Run type checking
npx tsc --noEmit
```

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## 🧪 Testing

### Manual Testing Checklist

- [ ] Input validation (empty fields, short inputs)
- [ ] Generate button shows loading state
- [ ] Results display correctly
- [ ] PDF downloads work for both resume and cover letter
- [ ] Copy HTML functionality works
- [ ] Error messages display user-friendly text
- [ ] Mobile responsive (test on 320px width)
- [ ] Sample data loads correctly
- [ ] Retry logic works (disconnect network temporarily)

## 🔒 Security Notes

- API keys are stored server-side only (in environment variables)
- No user data is persisted (stateless application)
- All PDF generation happens client-side
- Input validation prevents empty/minimal submissions

## 📄 License

MIT License - feel free to use this for personal or commercial projects.

## 🤝 Contributing

This is an MVP starter template. Potential improvements:

- Add file upload support (PDF/DOCX parsing)
- Implement dark mode toggle
- Add Vercel Web Analytics
- Multiple resume templates
- Export to Word format
- User history/session storage
- Custom prompt editing

## 🙏 Acknowledgments

- [Groq](https://groq.com) for fast, free LLM inference
- [Next.js](https://nextjs.org) for the excellent framework
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) for client-side PDF generation
- [Tailwind CSS](https://tailwindcss.com) for rapid UI development

---

**Built with ❤️ for job seekers everywhere**

For issues or questions, please check the troubleshooting section or review the code comments.
