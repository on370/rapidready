const fs = require('fs');

let centerPath = 'src/components/views/library/LibraryCenter.tsx';
let centerContent = fs.readFileSync(centerPath, 'utf8');

if (!centerContent.includes('const displayedImages')) {
  centerContent = centerContent.replace(
    'const { images, activeImageIndex, setActiveImageIndex, autoAdvance, updateCullingState } = useLibraryStore();',
    `const { images, activeImageIndex, setActiveImageIndex, autoAdvance, updateCullingState, activeFolderPath } = useLibraryStore();
  const displayedImages = activeFolderPath ? images.filter(img => img.path.startsWith(activeFolderPath)) : images;`
  );

  centerContent = centerContent.replace(
    'const activeImage = images[activeImageIndex];',
    `const activeImage = displayedImages[activeImageIndex];`
  );

  // Update handleCulling to find the global index
  centerContent = centerContent.replace(
    'updateCullingState(activeImageIndex, { flag, rating });',
    `const globalIndex = images.findIndex(img => img.path === activeImage.path);
    if (globalIndex !== -1) updateCullingState(globalIndex, { flag, rating });`
  );

  // Update images.length to displayedImages.length
  centerContent = centerContent.replaceAll('images.length', 'displayedImages.length');
  centerContent = centerContent.replaceAll('images.map((img, idx)', 'displayedImages.map((img, idx)');
  
  fs.writeFileSync(centerPath, centerContent);
  console.log('Updated LibraryCenter filtering');
}
