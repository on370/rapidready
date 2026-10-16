import { 
  formatCameraModel, formatLensModel 
} from './formatMetadata.ts';

function assertEqual(actual: any, expected: any, desc: string) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${desc} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`PASS: ${desc}`);
}

console.log('Testing formatMetadata camera and lens models...');

// 1. Camera model cleaning
assertEqual(
  formatCameraModel('"Canon DIGITAL IXUS", "", "", "", "", "", "", "", ""'),
  'Canon DIGITAL IXUS',
  'Camera with kamadak-exif null string array'
);
assertEqual(
  formatCameraModel('Canon DIGITAL IXUS", "", "", "", "", "", "", "", ""'),
  'Canon DIGITAL IXUS',
  'Camera with stripped leading quote but trailing commas'
);
assertEqual(
  formatCameraModel('Canon Canon EOS R5'),
  'Canon EOS R5',
  'Camera duplicate manufacturer prefix'
);
assertEqual(
  formatCameraModel('NIKON CORPORATION NIKON D850'),
  'NIKON D850',
  'Camera Nikon corporation duplicate'
);
assertEqual(
  formatCameraModel('Unknown'),
  null,
  'Camera Unknown placeholder'
);
assertEqual(
  formatCameraModel('Default'),
  null,
  'Camera Default placeholder'
);
assertEqual(
  formatCameraModel('---'),
  null,
  'Camera dashes'
);
assertEqual(
  formatCameraModel('""'),
  null,
  'Camera empty quotes'
);

// 2. Lens model cleaning
assertEqual(
  formatLensModel('"EF24-105mm f/4L IS USM", "", ""'),
  'EF24-105mm f/4L IS USM',
  'Lens with kamadak-exif quotes'
);
assertEqual(
  formatLensModel('Canon Canon EF 50mm f/1.8 STM'),
  'Canon EF 50mm f/1.8 STM',
  'Lens duplicate brand'
);
assertEqual(
  formatLensModel('0.0 mm f/0.0'),
  null,
  'Lens dummy 0.0 mm f/0.0'
);
assertEqual(
  formatLensModel('0 mm'),
  null,
  'Lens dummy 0 mm'
);
assertEqual(
  formatLensModel('No Lens'),
  null,
  'Lens dummy No Lens'
);
assertEqual(
  formatLensModel('Unknown Lens'),
  null,
  'Lens dummy Unknown Lens'
);

console.log('All formatMetadata tests passed successfully!');
