'use client';
import { useState } from 'react';
import Papa from 'papaparse';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [results, setResults] = useState([]);
  const [batchOverview, setBatchOverview] = useState('');
  const [files, setFiles] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files));
    setErrorMessage('');
  };

  // Safe Delay function to bypass 429 Rate Limits
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const processBatch = async () => {
    if (!files.length) return;

    setLoading(true);
    setResults([]);
    setErrorMessage('');
    const generatedData = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgressText(`Processing image ${i + 1} of ${files.length}... Please wait.`);

      const reader = new FileReader();
      const base64Promise = new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });

      const imageBase64 = await base64Promise;

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            imageBase64, 
            fileName: file.name,
            batchOverview: batchOverview 
          }),
        });
        
        const data = await res.json();
        
        if (res.ok && !data.error) {
          generatedData.push({ ...data, previewUrl: imageBase64 });
          setResults([...generatedData]); // Live Update Table
        } else {
          console.error("API Error:", data.error);
          setErrorMessage(`Error on ${file.name}: ${data.error}`);
        }
      } catch (err) {
        console.error("Error processing file:", file.name, err);
        setErrorMessage("Network error or server failed to respond.");
      }

      // Safe 1.5 Second delay between requests for Free Tier Stability
      if (i < files.length - 1) {
        await delay(1500);
      }
    }

    setLoading(false);
    setProgressText('');
  };

  const handleResultChange = (index, field, value) => {
    const updated = [...results];
    updated[index][field] = value;
    setResults(updated);
  };

  const downloadCSV = () => {
    const csvData = results.map(item => ({
      'Filename': item.filename,
      'Title': item.title,
      'Keywords': item.keywords,
      'Category': item.category || 'Graphic Resources'
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'adobe_stock_metadata.csv');
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div style={{ padding: '30px 20px', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1100px', margin: '0 auto', color: '#333' }}>
      
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#111' }}>
          Adobe Stock SEO Metadata Generator
        </h1>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          Generate, Preview, and Edit SEO Keywords for Adobe Stock
        </p>
      </div>

      {/* Inputs Container */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', marginBottom: '30px' }}>
        
        {/* Batch Overview Box */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontWeight: '600', display: 'block', marginBottom: '8px', fontSize: '14px', color: '#475569' }}>
            Batch Context / Special Instructions (Optional):
          </label>
          <textarea
            rows={2}
            placeholder="e.g., Minimalist blue outline icons set for corporate business, technology, and cybersecurity."
            value={batchOverview}
            onChange={(e) => setBatchOverview(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        {/* Upload Box */}
        <div style={{ padding: '24px', border: '2px dashed #0070f3', borderRadius: '8px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
          <input type="file" multiple accept="image/*" onChange={handleFileChange} disabled={loading} style={{ cursor: 'pointer' }} />
          {files.length > 0 && (
            <p style={{ marginTop: '12px', fontWeight: '600', color: '#0070f3', margin: '12px 0 0 0' }}>
              ✓ {files.length} File(s) Selected
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button 
          onClick={processBatch} 
          disabled={loading || !files.length}
          style={{ width: '100%', marginTop: '20px', padding: '14px', backgroundColor: loading ? '#94a3b8' : '#0070f3', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? progressText : 'Generate Metadata'}
        </button>

        {errorMessage && (
          <p style={{ color: '#ef4444', marginTop: '12px', fontWeight: '500', textAlign: 'center', fontSize: '14px' }}>
            {errorMessage}
          </p>
        )}
      </div>

      {/* CSVNest Style Table Preview Section */}
      {results.length > 0 && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#0f172a' }}>
              Metadata Preview ({results.length} / {files.length} Completed)
            </h2>
            <button 
              onClick={downloadCSV} 
              style={{ padding: '10px 20px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
            >
              ⬇ Download CSV File
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>
                  <th style={{ padding: '12px', width: '80px' }}>Preview</th>
                  <th style={{ padding: '12px', width: '150px' }}>Filename</th>
                  <th style={{ padding: '12px', width: '250px' }}>Title</th>
                  <th style={{ padding: '12px' }}>Keywords (Top SEO Priority)</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px' }}>
                      <img src={item.previewUrl} alt="preview" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }} />
                    </td>
                    <td style={{ padding: '12px', wordBreak: 'break-all', fontWeight: '500', color: '#475569' }}>
                      {item.filename}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <textarea
                        rows={3}
                        value={item.title}
                        onChange={(e) => handleResultChange(index, 'title', e.target.value)}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <textarea
                        rows={4}
                        value={item.keywords}
                        onChange={(e) => handleResultChange(index, 'keywords', e.target.value)}
                        style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  );
}
