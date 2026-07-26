'use client';
import { useState } from 'react';
import Papa from 'papaparse';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setLoading(true);
    const generatedData = [];

    for (const file of files) {
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
          body: JSON.stringify({ imageBase64, fileName: file.name }),
        });
        const data = await res.json();
        if (res.ok) generatedData.push(data);
      } catch (err) {
        console.error("Error processing file:", file.name, err);
      }
    }

    setResults(generatedData);
    setLoading(false);
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
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
      <h2>Adobe Stock SEO Metadata Generator</h2>
      <p>Upload your Vector Previews (JPG/PNG) to generate SEO optimized CSV</p>
      
      <div style={{ margin: '30px 0', padding: '20px', border: '2px dashed #ccc', borderRadius: '10px' }}>
        <input type="file" multiple accept="image/*" onChange={handleFileUpload} disabled={loading} />
      </div>
      
      {loading && <p style={{ color: 'blue', fontWeight: 'bold' }}>Analyzing images with AI and applying SEO Rules... Please wait.</p>}

      {results.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h3 style={{ color: 'green' }}>Processed {results.length} Files Successfully!</h3>
          <button onClick={downloadCSV} style={{ padding: '12px 24px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}>
            Download Adobe Stock CSV File
          </button>
        </div>
      )}
    </div>
  );
}
