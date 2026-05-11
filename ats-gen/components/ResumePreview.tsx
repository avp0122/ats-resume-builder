'use client';

import React, { useState } from 'react';

interface ResumePreviewProps {
  htmlContent: string;
  title: string;
  onDownload: (html: string, filename: string) => void;
  onCopy?: (html: string) => void;
}

/**
 * ResumePreview Component
 * 
 * Displays HTML content preview with download and copy functionality
 */
export default function ResumePreview({ 
  htmlContent, 
  title, 
  onDownload,
  onCopy 
}: ResumePreviewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (onCopy) {
      onCopy(htmlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        <div className="flex gap-2">
          {onCopy && (
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
              title="Copy HTML"
            >
              {copied ? '✓ Copied' : 'Copy HTML'}
            </button>
          )}
          <button
            onClick={() => onDownload(htmlContent, `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`)}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Download PDF
          </button>
        </div>
      </div>
      
      <div 
        className="prose max-w-none border rounded p-4 bg-gray-50 overflow-auto"
        style={{ maxHeight: '600px' }}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
}
