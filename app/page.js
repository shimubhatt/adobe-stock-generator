'use client';

import { useState } from 'react';
import Papa from 'papaparse';

export default function Home() {
  const [files, setFiles] = useState([]);
  const [customInstructions, setCustomInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files));
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleGenerate = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setResults([]);

    const newResults = [];

    for (const file of files) {
      try {
        const base64 = await convertToBase64(file);
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            customInstructions,
            filename: file.name, // Pass actual filename
          }),
        });

        const data = await res.json();
        if (data.success) {
          newResults.push({
            preview: URL.createObjectURL(file),
            filename: data.filename || file.name,
            title: data.title,
            keywords: data.keywords,
            category: data.category || 'Graphic Resources',
          });
        }
      } catch (err) {
        console.error('Generation Error:', err);
      }
    }

    setResults(newResults);
    setLoading(false);
  };

  const handleDownloadCSV = () => {
    const csvData = results.map((item) => ({
      Filename: item.filename,
      Title: item.title,
      Keywords: item.keywords,
      Category: item.category,
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'adobe_stock_metadata.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Adobe Stock SEO Metadata Generator</h1>

      <div style={{ marginBottom: '1rem' }}>
        <label>Batch Context / Special Instructions (Optional):</label>
        <textarea
          style={{ width: '100%', height: '80px', marginTop: '5px', padding: '10px' }}
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="e.g., 1930s vintage rubber hose style cartoon Halloween icons."
        />
      </div>

      <div style={{ border: '2px dashed #0066ff', padding: '2rem', textAlign: 'center', marginBottom: '1rem', borderRadius: '8px' }}>
        <input type="file" multiple accept="image/*" onChange={handleFileChange} />
        {files.length > 0 && <p style={{ marginTop: '10px', color: '#0066ff', fontWeight: 'bold' }}>✓ {files.length} File(s) Selected</p>}
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || files.length === 0}
        style={{ width: '100%', padding: '14px', backgroundColor: loading ? '#888' : '#0066ff', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
      >
        {loading ? 'Analyzing Images & Generating Metadata...' : 'Generate Metadata'}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Metadata Preview ({results.length} Completed)</h3>
            <button
              onClick={handleDownloadCSV}
              style={{ backgroundColor: '#00b87c', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              ↓ Download CSV File
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', border: '1px solid #ddd' }}>
            <thead>
              <tr style={{ background: '#f0f4f8', textAlign: 'left' }}>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>Preview</th>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>Filename</th>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>Title</th>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>Keywords (Top SEO Priority)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
                    <img src={item.preview} alt="" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd', fontSize: '13px', wordBreak: 'break-all' }}>
                    {item.filename}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                    <textarea
                      value={item.title}
                      onChange={(e) => {
                        const updated = [...results];
                        updated[index].title = e.target.value;
                        setResults(updated);
                      }}
                      style={{ width: '100%', height: '65px', padding: '5px', fontSize: '13px' }}
                    />
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                    <textarea
                      value={item.keywords}
                      onChange={(e) => {
                        const updated = [...results];
                        updated[index].keywords = e.target.value;
                        setResults(updated);
                      }}
                      style={{ width: '100%', height: '65px', padding: '5px', fontSize: '13px' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
