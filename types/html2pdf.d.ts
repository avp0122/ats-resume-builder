declare module 'html2pdf.js' {
  type Html2PdfOptions = {
    margin?: number | [number, number] | [number, number, number, number];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: {
      scale?: number;
      useCORS?: boolean;
      backgroundColor?: string;
      windowWidth?: number;
      [k: string]: unknown;
    };
    jsPDF?: { unit?: string; format?: string; orientation?: string };
    pagebreak?: { mode?: string | string[]; before?: string; after?: string; avoid?: string };
  };

  type Html2PdfInstance = {
    set: (options: Html2PdfOptions) => Html2PdfInstance;
    from: (element: HTMLElement | Element) => Html2PdfInstance;
    save: () => Promise<void>;
  };

  const html2pdf: () => Html2PdfInstance;
  export default html2pdf;
}
