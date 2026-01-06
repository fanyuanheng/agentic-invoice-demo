import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, File, X } from 'lucide-react';

export default function FileDropZone({ onFileSelect, isProcessing, selectedFile: externalSelectedFile, onClearFile }) {
  const [isDragging, setIsDragging] = useState(false);
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  
  // Use external selectedFile if provided, otherwise use internal state
  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFile(file);
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFile(file);
    }
  };

  const handleFile = (file) => {
    if (externalSelectedFile === undefined) {
      setInternalSelectedFile(file);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      onFileSelect(base64, file);
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    if (externalSelectedFile !== undefined && onClearFile) {
      onClearFile();
    } else {
      setInternalSelectedFile(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <motion.div
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isProcessing && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="hidden"
        disabled={isProcessing}
      />
      
      <motion.div
        className={`
          relative rounded-2xl border-2 border-dashed 
          bg-gradient-to-br from-white/5 to-white/10 
          backdrop-blur-xl p-12 cursor-pointer
          transition-all duration-300
          ${isDragging ? 'border-white/50 bg-white/10 scale-105' : 'border-white/20'}
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/40 hover:bg-white/10'}
        `}
        animate={isDragging ? {
          scale: 1.02,
          borderColor: 'rgba(255, 255, 255, 0.5)'
        } : {}}
      >
        {selectedFile ? (
          <div className="flex items-center justify-center gap-4">
            <File className="w-12 h-12 text-white/70" />
            <div className="flex-1 text-left">
              <p className="text-white font-medium">{selectedFile.name}</p>
              <p className="text-white/60 text-sm">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
            </div>
            {!isProcessing && (
              <button
                onClick={handleRemove}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5 text-white/70" />
              </button>
            )}
          </div>
        ) : (
          <div className="text-center">
            <motion.div
              animate={isDragging ? { scale: 1.1, rotate: 5 } : {}}
              transition={{ duration: 0.2 }}
            >
              <Upload className="w-16 h-16 text-white/50 mx-auto mb-4" />
            </motion.div>
            <p className="text-white/80 text-lg font-medium mb-2">
              Drop invoice image here
            </p>
            <p className="text-white/50 text-sm">
              or click to browse
            </p>
          </div>
        )}
        
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl backdrop-blur-sm">
            <div className="text-white/80 font-medium">Processing...</div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

