// Görüntü işleme ve OCR fonksiyonları
const { createWorker } = require('tesseract.js');
const fetch = require('node-fetch');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');

// OCR ayarları
const OCR_ENABLED = process.env.OCR_ENABLED === 'true';
const TESSERACT_LANG = process.env.TESSERACT_LANG || 'eng';

// Geçici dosya yolu için
const TEMP_DIR = path.join(os.tmpdir(), 'csgo-code-checker');

// Tesseract OCR çalışanı
let ocrWorker = null;

// OCR çalışanını başlat
async function initializeOCR() {
  if (!OCR_ENABLED) {
    console.log('OCR işlevi devre dışı bırakıldı. Etkinleştirmek için .env dosyasında OCR_ENABLED=true ayarlayın.');
    return null;
  }

  try {
    console.log(`OCR çalışanı başlatılıyor... (Dil: ${TESSERACT_LANG})`);
    
    // Geçici dizini oluştur (yoksa)
    if (!fs.existsSync(TEMP_DIR)) {
      try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        console.log(`Geçici dizin oluşturuldu: ${TEMP_DIR}`);
      } catch (dirError) {
        console.error(`Geçici dizin oluşturma hatası: ${dirError.message}`);
        console.log(`Alternatif dizin kullanılacak: ${os.tmpdir()}`);
        TEMP_DIR = os.tmpdir(); // Alternatif geçici dizini kullan
      }
    }
    
    // Tesseract çalışanını başlat
    if (!ocrWorker) {
      ocrWorker = await createWorker(TESSERACT_LANG, 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            process.stdout.write(`\rOCR işleme: ${Math.floor(m.progress * 100)}%`);
          } else if (m.status === 'loading tesseract core') {
            console.log(`Tesseract çekirdeği yükleniyor: ${Math.floor(m.progress * 100)}%`);
          } else {
            console.log(`OCR: ${m.status}`);
          }
        }
      });

      console.log('\nOCR çalışanı başarıyla başlatıldı.');
    }
    
    return ocrWorker;
  } catch (error) {
    console.error('OCR başlatma hatası:', error);
    return null;
  }
}

// OCR çalışanını kapat
async function terminateOCR() {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
    console.log('OCR çalışanı kapatıldı.');
  }
}

// URL'den görüntü işleme fonksiyonu (test amaçlı)
async function processImageFromUrl(imageUrl, codeRegex) {
  try {
    console.log(`İşleniyor: ${imageUrl}`);
    const startTime = Date.now();
    
    // OCR başlat
    const worker = await initializeOCR();
    if (!worker) {
      return { error: 'OCR is disabled' };
    }
    
    // Görüntüyü indir
    const response = await fetch(imageUrl);
    const buffer = await response.buffer();
    
    // Geçici dizini oluştur (yoksa)
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    // Görüntü boyutlarını al
    const imageMetadata = await sharp(buffer).metadata();
    const { width, height } = imageMetadata;
    
    // Görüntünün ortasını kırp (kodlar genellikle merkezdedir)
    // Merkezdeki %60 alanı al (oran ayarlanabilir)
    const cropRatio = 0.6;
    const cropWidth = Math.round(width * cropRatio);
    const cropHeight = Math.round(height * cropRatio);
    const cropLeft = Math.round((width - cropWidth) / 2);
    const cropTop = Math.round((height - cropHeight) / 2);
    
    console.log(`Görüntü kırpılıyor: ${width}x${height} -> ${cropWidth}x${cropHeight} (orta bölge)`);
    
    // Görüntüyü işle
    const processedImagePath = path.join(TEMP_DIR, `processed_${Date.now()}.png`);
    
    await sharp(buffer)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .greyscale()
      .normalize()
      .sharpen()
      .toFile(processedImagePath);
    
    // OCR işlemi
    const { data } = await worker.recognize(processedImagePath);
    
    // Temizlik
    fs.unlinkSync(processedImagePath);
    
    // İşleme süresi
    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;
    
    // Ham OCR çıktısı
    const rawText = data.text;
    
    // Metinden kodları çıkar (filtreleme yapmadan)
    const matches = rawText.match(codeRegex) || [];
    
    // Yalın kod listesi
    const cleanedMatches = [...new Set(matches)].map(match => {
      // Kod etrafındaki gereksiz karakterleri temizle
      return match.replace(/[^A-Z0-9]/g, '');
    });
    
    return {
      text: rawText,
      filteredText: rawText, // Filtreleme yapmıyoruz, kırpma işlemi yeterli
      codes: cleanedMatches,
      processingTimeMs
    };
  } catch (error) {
    console.error('Görüntü işleme hatası:', error);
    return { error: error.message };
  }
}

// Metin içinden CSGO kodlarını akıllı filtreleme ile çıkar
function filterCSGOCodes(text, codeRegex) {
  // Satırlara ayır (kod genellikle tek satırda)
  const lines = text.split('\n').filter(line => line.trim() !== '');
  
  // Yaygın olan gereksiz metin kalıpları
  const unwantedPatterns = [
    /free\s*c*o*de/i,
    /csgo\s*skins/i,
    /promo(tional)?\s*code/i,
    /^code:?\s*$/i,
    /^\s*use\s*code\s*$/i
  ];
  
  // İstenmeyen kalıpları içermeyen satırları seç
  const filteredLines = lines.filter(line => {
    // Satırın istenmeyen bir kalıp içerip içermediğini kontrol et
    const containsUnwanted = unwantedPatterns.some(pattern => pattern.test(line));
    
    // İstenmeyen kalıp içeriyorsa BU SATIRI REDDET
    return !containsUnwanted;
  });
  
  // Filtrelenmiş satırlardan kod olma ihtimali olanları seç
  const potentialCodeLines = filteredLines.filter(line => codeRegex.test(line));
  
  // Filtre sonrası nihai metin
  const filteredText = potentialCodeLines.join('\n');
  
  // Regex ile kodları çıkar
  const matches = filteredText.match(codeRegex) || [];
  
  // Yalın kod listesi
  const cleanedMatches = [...new Set(matches)].map(match => {
    // Kod etrafındaki gereksiz karakterleri temizle
    return match.replace(/[^A-Z0-9]/g, '');
  });
  
  return {
    filteredText,
    codes: cleanedMatches
  };
}

// Discord mesajından görüntüleri işle ve kodları ara
async function processMessageForImageCodes(message, codeRegex) {
  const foundCodes = [];
  
  try {
    // Mesaj içeriğinde kod var mı kontrol et
    const textMatches = message.content ? message.content.match(codeRegex) : null;
    if (textMatches) {
      textMatches.forEach(code => {
        foundCodes.push(code);
      });
    }
    
    // OCR devre dışı bırakıldıysa sadece metin içeriğini işle
    if (!OCR_ENABLED || !message.attachments || message.attachments.size === 0) {
      return foundCodes;
    }
    
    // Mesajda ekler var mı kontrol et
    // OCR çalışanını başlat
    const worker = await initializeOCR();
    if (!worker) {
      return foundCodes;
    }
    
    for (const [_, attachment] of message.attachments) {
      // Sadece görüntü dosyalarını işle
      if (attachment.contentType && attachment.contentType.startsWith('image/')) {
        console.log(`Görüntü işleniyor: ${attachment.url}`);
        
        try {
          // Görüntüyü indir
          const response = await fetch(attachment.url);
          const buffer = await response.buffer();
          
          // Görüntü boyutlarını al
          const imageMetadata = await sharp(buffer).metadata();
          const { width, height } = imageMetadata;
          
          // Görüntünün ortasını kırp (kodlar genellikle merkezdedir)
          // Merkezdeki %60 alanı al (oran ayarlanabilir)
          const cropRatio = 0.6; 
          const cropWidth = Math.round(width * cropRatio);
          const cropHeight = Math.round(height * cropRatio);
          const cropLeft = Math.round((width - cropWidth) / 2);
          const cropTop = Math.round((height - cropHeight) / 2);
          
          console.log(`Görüntü kırpılıyor: ${width}x${height} -> ${cropWidth}x${cropHeight} (orta bölge)`);
          
          // Görüntüyü işle ve OCR için optimize et
          const processedImagePath = path.join(TEMP_DIR, `processed_${Date.now()}.png`);
          
          // Görüntüyü işle (kırp, kontrast artır, vs)
          await sharp(buffer)
            .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
            .greyscale() // Gri tonlama
            .normalize() // Kontrastı normalleştir
            .sharpen() // Keskinleştir
            .toFile(processedImagePath);
          
          // OCR işlemi yap
          const { data } = await worker.recognize(processedImagePath);
          console.log('Ham OCR sonucu:', data.text);
          
          // Temizlik
          fs.unlinkSync(processedImagePath);
          
          // OCR sonucundan direkt kodları çıkar (filtreleme yerine kırpma kullanıyoruz)
          const matches = data.text.match(codeRegex) || [];
          
          // Yalın kodları ekle
          if (matches && matches.length > 0) {
            // Kodları temizle ve yinelenenleri kaldır
            const cleanedMatches = [...new Set(matches)].map(match => {
              return match.replace(/[^A-Z0-9]/g, '');
            });
            
            console.log('Bulunan kodlar:', cleanedMatches);
            
            cleanedMatches.forEach(code => {
              // Kod daha önce eklenmemişse ekle
              if (!foundCodes.includes(code)) {
                foundCodes.push(code);
              }
            });
          } else {
            console.log('Görüntüde kod bulunamadı.');
          }
        } catch (imgError) {
          console.error('Görüntü işleme hatası:', imgError);
        }
      }
    }
  } catch (error) {
    console.error('Mesaj işleme hatası:', error);
  }
  
  return foundCodes;
}

module.exports = {
  initializeOCR,
  terminateOCR,
  processMessageForImageCodes,
  processImageFromUrl
}; 