import React, { useEffect, useRef, useCallback } from 'react';
import { useLibraryUIStore, FocusPeakingColor } from '../../../../stores/libraryUIStore';

export interface FocusPeakingOverlayProps {
  imageRef: React.RefObject<HTMLImageElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  className?: string;
  triggerUpdate?: any;
  ready?: boolean;
}

const PEAKING_COLORS: Record<FocusPeakingColor, [number, number, number]> = {
  green: [0.0, 1.0, 0.2],
  red: [1.0, 0.1, 0.2],
  cyan: [0.0, 0.95, 1.0],
  yellow: [1.0, 0.95, 0.0],
};

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_textureSize;    // Texture dimensions (texW, texH)
uniform vec4 u_imageRect;      // [x, y, width, height] in canvas physical pixels
uniform vec2 u_canvasSize;     // Canvas physical dimensions
uniform vec3 u_color;          // Peaking highlight color RGB
uniform float u_threshold;     // Edge detection threshold
uniform float u_dpr;           // Device Pixel Ratio

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Gradient-Magnitude über 8 Nachbarn bei gegebenem Delta
// Entspricht _laplacian() aus darktable:
//   l1 = hypot(east - west, south - north)         (Achsen)
//   l2 = hypot(SE - NW, SW - NE)                   (Diagonalen)
//   return (l1 + l2) / 2.0
float gradientMag(vec2 uv, vec2 delta) {
  float n  = luma(texture2D(u_texture, uv + vec2(      0.0, -delta.y)).rgb);
  float s  = luma(texture2D(u_texture, uv + vec2(      0.0,  delta.y)).rgb);
  float w  = luma(texture2D(u_texture, uv + vec2(-delta.x,       0.0)).rgb);
  float e  = luma(texture2D(u_texture, uv + vec2( delta.x,       0.0)).rgb);
  float nw = luma(texture2D(u_texture, uv + vec2(-delta.x, -delta.y)).rgb);
  float ne = luma(texture2D(u_texture, uv + vec2( delta.x, -delta.y)).rgb);
  float sw = luma(texture2D(u_texture, uv + vec2(-delta.x,  delta.y)).rgb);
  float se = luma(texture2D(u_texture, uv + vec2( delta.x,  delta.y)).rgb);

  // Achsen-Gradient
  float l1 = length(vec2(e - w, s - n));
  // Diagonalen-Gradient
  float l2 = length(vec2(se - nw, sw - ne));

  return (l1 + l2) * 0.5;
}

// Bandpass-Fokusmetrik: Gradient(nah) - Anteil * Gradient(fern)
float evaluateFocus(vec2 uv) {
  vec2 s = 1.0 / u_textureSize;

  float c  = luma(texture2D(u_texture, uv).rgb);
  float n  = luma(texture2D(u_texture, uv + vec2(      0.0, -s.y)).rgb);
  float so = luma(texture2D(u_texture, uv + vec2(      0.0,  s.y)).rgb);
  float w  = luma(texture2D(u_texture, uv + vec2(-s.x,       0.0)).rgb);
  float e  = luma(texture2D(u_texture, uv + vec2( s.x,       0.0)).rgb);
  float nw = luma(texture2D(u_texture, uv + vec2(-s.x, -s.y)).rgb);
  float ne = luma(texture2D(u_texture, uv + vec2( s.x, -s.y)).rgb);
  float sw = luma(texture2D(u_texture, uv + vec2(-s.x,  s.y)).rgb);
  float se = luma(texture2D(u_texture, uv + vec2( s.x,  s.y)).rgb);

  // Schnelle Rauschsperre: 3x3 microRange
  float mn = min(c, min(min(w, e), min(min(n, so), min(min(nw, ne), min(sw, se)))));
  float mx = max(c, max(max(w, e), max(max(n, so), max(max(nw, ne), max(sw, se)))));
  if (mx - mn < 0.012) return 0.0;

  // Zwei-Skalen-Gradient (Kern des darktable-Algorithmus)
  float l1 = length(vec2(e - w, so - n));
  float l2 = length(vec2(se - nw, sw - ne));
  float gradClose = (l1 + l2) * 0.5;             // delta = 1 Pixel

  float gradFar   = gradientMag(uv, s * 2.0);    // delta = 2 Pixel

  // Bandpass: Naher Gradient minus Anteil des fernen Gradienten
  // Der Faktor 0.67 und der Noise-Floor 0.004 stammen aus darktable
  float bandpass = gradClose - 0.67 * max(gradFar - 0.004, 0.0);

  return max(bandpass, 0.0);
}

void main() {
  // Guard against uninitialized or degenerate texture/image dimensions
  if (u_textureSize.x < 10.0 || u_textureSize.y < 10.0 || u_imageRect.z < 10.0 || u_imageRect.w < 10.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Flip Y to match DOM top-left coordinate system
  vec2 screenCoord = vec2(gl_FragCoord.x, u_canvasSize.y - gl_FragCoord.y);

  // Discard fragments outside image bounding rect
  if (screenCoord.x < u_imageRect.x || screenCoord.x > u_imageRect.x + u_imageRect.z ||
      screenCoord.y < u_imageRect.y || screenCoord.y > u_imageRect.y + u_imageRect.w) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Normalized UV coordinates within the image [0.0, 1.0]
  vec2 uv = (screenCoord - u_imageRect.xy) / u_imageRect.zw;

  // Einfache Dilation: Center + 4 Nachbarn (kein 9-fach-overkill)
  vec2 sensorTexel = 1.0 / u_textureSize;
  float val = evaluateFocus(uv);
  val = max(val, evaluateFocus(uv + vec2(-sensorTexel.x, 0.0)));
  val = max(val, evaluateFocus(uv + vec2( sensorTexel.x, 0.0)));
  val = max(val, evaluateFocus(uv + vec2(0.0, -sensorTexel.y)));
  val = max(val, evaluateFocus(uv + vec2(0.0,  sensorTexel.y)));

  if (val > u_threshold) {
    gl_FragColor = vec4(u_color, 1.0);
  } else {
    gl_FragColor = vec4(0.0);
  }
}
`;

export const FocusPeakingOverlay = React.memo(function FocusPeakingOverlay({
  imageRef,
  containerRef,
  className = '',
  triggerUpdate,
  ready = true,
}: FocusPeakingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const currentTextureSrcRef = useRef<string | null>(null);
  const textureSizeRef = useRef<{ width: number; height: number }>({ width: 1, height: 1 });
  const animationFrameRef = useRef<number | null>(null);

  const {
    focusPeakingEnabled,
    focusPeakingColor,
    focusPeakingThreshold,
    loupeScale,
  } = useLibraryUIStore();

  // Initialize WebGL context and shaders
  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    if (glRef.current && programRef.current && glRef.current.canvas === canvas) return true;

    if (glRef.current && glRef.current.canvas !== canvas) {
      if (textureRef.current) {
        glRef.current.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      if (programRef.current) {
        glRef.current.deleteProgram(programRef.current);
        programRef.current = null;
      }
      glRef.current = null;
      currentTextureSrcRef.current = null;
    }

    const gl = canvas.getContext('webgl', { 
      alpha: true, 
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;

    glRef.current = gl;

    // Compile Vertex Shader
    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return false;
    gl.shaderSource(vs, VERTEX_SHADER_SOURCE);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('FocusPeaking Vertex Shader compile error:', gl.getShaderInfoLog(vs));
      gl.deleteShader(vs);
      return false;
    }

    // Compile Fragment Shader
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) {
      gl.deleteShader(vs);
      return false;
    }
    gl.shaderSource(fs, FRAGMENT_SHADER_SOURCE);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('FocusPeaking Fragment Shader compile error:', gl.getShaderInfoLog(fs));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }

    // Link Program
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('FocusPeaking Program link error:', gl.getProgramInfoLog(program));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
      return false;
    }

    programRef.current = program;

    // Setup full-screen quad geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const quad = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    return true;
  }, []);

  // Update texture when the underlying image source changes
  const updateTexture = useCallback(() => {
    const gl = glRef.current;
    const img = imageRef.current;
    if (!gl || !img || !img.complete || img.naturalWidth <= 10 || img.naturalHeight <= 10) return;

    const effectiveSrc = img.currentSrc || img.src;
    if (currentTextureSrcRef.current === effectiveSrc && textureRef.current) {
      return; // Already up-to-date
    }

    try {
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      // WebGL 1 texture params for non-power-of-two (NPOT) full-res images
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Check GPU max texture size
      const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
      let texW = img.naturalWidth;
      let texH = img.naturalHeight;

      if (img.naturalWidth > maxTexSize || img.naturalHeight > maxTexSize) {
        // Downscale to fit within GPU max texture size
        const ratio = Math.min(maxTexSize / img.naturalWidth, maxTexSize / img.naturalHeight);
        texW = Math.floor(img.naturalWidth * ratio);
        texH = Math.floor(img.naturalHeight * ratio);
      }

      // Rasterize via intermediate 2D canvas to guarantee that EXIF orientation
      // (portrait vs landscape) is 100% normalized and consistent across all WebGL backends.
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = texW;
      tempCanvas.height = texH;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, texW, texH);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      }

      textureRef.current = texture;
      textureSizeRef.current = { width: texW, height: texH };
      currentTextureSrcRef.current = effectiveSrc;
    } catch (e) {
      console.warn('Failed to bind image texture for Focus Peaking:', e);
    }
  }, [imageRef]);

  // Main render pass
  const render = useCallback(() => {
    if (!focusPeakingEnabled || ready === false) {
      const gl = glRef.current;
      if (gl) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      return;
    }

    if (!initWebGL()) return;

    const gl = glRef.current;
    const program = programRef.current;
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const container = containerRef.current;

    if (!gl || !program || !canvas || !img || !container) return;

    if (!img.complete || img.naturalWidth <= 10 || img.naturalHeight <= 10) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    updateTexture();

    if (!textureRef.current) return;

    const dpr = window.devicePixelRatio || 1;
    const canRect = canvas.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    if (canRect.width <= 0 || canRect.height <= 0) return;

    // Resize canvas buffer if necessary
    const targetW = Math.round(canRect.width * dpr);
    const targetH = Math.round(canRect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    // Uniform: texture & native sensor size
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    const uTextureLoc = gl.getUniformLocation(program, 'u_texture');
    gl.uniform1i(uTextureLoc, 0);

    const uTexSizeLoc = gl.getUniformLocation(program, 'u_textureSize');
    gl.uniform2f(
      uTexSizeLoc, 
      textureSizeRef.current.width || img.naturalWidth || 1, 
      textureSizeRef.current.height || img.naturalHeight || 1
    );

    // Calculate actual image content rect inside the <img> element
    // taking object-fit: contain (and letterboxing / pillarboxing) into account
    let contentX = imgRect.left;
    let contentY = imgRect.top;
    let contentW = imgRect.width;
    let contentH = imgRect.height;

    const natW = img.naturalWidth;
    const natH = img.naturalHeight;

    if (natW > 0 && natH > 0 && imgRect.width > 0 && imgRect.height > 0) {
      const imgAspect = natW / natH;
      const boxAspect = imgRect.width / imgRect.height;

      // When letterboxed or pillarboxed (e.g. object-fit: contain):
      if (Math.abs(imgAspect - boxAspect) > 0.001) {
        if (imgAspect > boxAspect) {
          // Wider than box: fitted by width, black bars top and bottom
          contentW = imgRect.width;
          contentH = imgRect.width / imgAspect;
          contentX = imgRect.left;
          contentY = imgRect.top + (imgRect.height - contentH) / 2;
        } else {
          // Taller than box: fitted by height, black bars left and right (portrait in landscape box)
          contentH = imgRect.height;
          contentW = imgRect.height * imgAspect;
          contentY = imgRect.top;
          contentX = imgRect.left + (imgRect.width - contentW) / 2;
        }
      }
    }

    // Uniform: image bounding rect relative to canvas in physical pixels
    const imgX = (contentX - canRect.left) * dpr;
    const imgY = (contentY - canRect.top) * dpr;
    const imgW = contentW * dpr;
    const imgH = contentH * dpr;
    const uImgRectLoc = gl.getUniformLocation(program, 'u_imageRect');
    gl.uniform4f(uImgRectLoc, imgX, imgY, imgW, imgH);

    // Uniform: canvas physical dimensions
    const uCanvasSizeLoc = gl.getUniformLocation(program, 'u_canvasSize');
    gl.uniform2f(uCanvasSizeLoc, canvas.width, canvas.height);

    // Uniform: peaking color
    const colorRgb = PEAKING_COLORS[focusPeakingColor] || PEAKING_COLORS.green;
    const uColorLoc = gl.getUniformLocation(program, 'u_color');
    gl.uniform3f(uColorLoc, colorRgb[0], colorRgb[1], colorRgb[2]);

    // Uniform: threshold
    const uThresholdLoc = gl.getUniformLocation(program, 'u_threshold');
    gl.uniform1f(uThresholdLoc, focusPeakingThreshold);

    // Uniform: device pixel ratio
    const uDprLoc = gl.getUniformLocation(program, 'u_dpr');
    gl.uniform1f(uDprLoc, dpr);

    // Draw quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, [
    focusPeakingEnabled,
    focusPeakingColor,
    focusPeakingThreshold,
    initWebGL,
    updateTexture,
    imageRef,
    containerRef,
    ready,
  ]);

  // Animation loop & convergence tracking
  const isLoopRunningRef = useRef(false);
  const lastImgRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  const startConvergenceLoop = useCallback(() => {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;
    let stableFrames = 0;

    const step = () => {
      if (!isLoopRunningRef.current) return;

      render();

      const img = imageRef.current;
      if (img) {
        const rect = img.getBoundingClientRect();
        const prev = lastImgRectRef.current;
        if (
          prev &&
          Math.abs(rect.left - prev.left) < 0.25 &&
          Math.abs(rect.top - prev.top) < 0.25 &&
          Math.abs(rect.width - prev.width) < 0.25 &&
          Math.abs(rect.height - prev.height) < 0.25
        ) {
          stableFrames++;
          if (stableFrames >= 2) {
            // Image has reached steady state, stop the loop to conserve CPU/GPU
            isLoopRunningRef.current = false;
            animationFrameRef.current = null;
            return;
          }
        } else {
          stableFrames = 0;
          lastImgRectRef.current = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        }
      }

      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }, [render, imageRef]);

  // Request a frame render whenever relevant state changes
  const scheduleRender = useCallback(() => {
    lastImgRectRef.current = null; // force at least 2 stable frames
    if (isLoopRunningRef.current) return;
    startConvergenceLoop();
  }, [startConvergenceLoop]);

  useEffect(() => {
    scheduleRender();
  }, [focusPeakingEnabled, focusPeakingColor, focusPeakingThreshold, loupeScale, triggerUpdate, ready, scheduleRender]);

  // Re-render when image finishes loading
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    const handleLoad = () => {
      currentTextureSrcRef.current = null; // force texture re-upload
      scheduleRender();
    };

    img.addEventListener('load', handleLoad);
    return () => {
      img.removeEventListener('load', handleLoad);
    };
  }, [imageRef, scheduleRender]);

  // Listen for CSS transitions on image (e.g. smooth zoom toggle)
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    const handleTransition = () => {
      scheduleRender();
    };

    img.addEventListener('transitionstart', handleTransition);
    img.addEventListener('transitionrun', handleTransition);
    img.addEventListener('transitionend', handleTransition);
    img.addEventListener('transitioncancel', handleTransition);

    return () => {
      img.removeEventListener('transitionstart', handleTransition);
      img.removeEventListener('transitionrun', handleTransition);
      img.removeEventListener('transitionend', handleTransition);
      img.removeEventListener('transitioncancel', handleTransition);
    };
  }, [imageRef, scheduleRender]);

  // Watch for container resizes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      scheduleRender();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [containerRef, scheduleRender]);

  // Watch for image transform/DOM changes via MutationObserver
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    const observer = new MutationObserver(() => {
      scheduleRender();
    });
    observer.observe(img, { attributes: true, attributeFilter: ['style', 'src'] });

    return () => {
      observer.disconnect();
    };
  }, [imageRef, scheduleRender]);

  // Cleanup WebGL on unmount
  useEffect(() => {
    return () => {
      isLoopRunningRef.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      const gl = glRef.current;
      if (gl) {
        if (textureRef.current) {
          gl.deleteTexture(textureRef.current);
          textureRef.current = null;
        }
        if (programRef.current) {
          gl.deleteProgram(programRef.current);
          programRef.current = null;
        }
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none z-10 transition-opacity duration-150 ${className}`}
      style={{ 
        display: focusPeakingEnabled ? 'block' : 'none',
        opacity: (focusPeakingEnabled && ready !== false) ? 1 : 0,
      }}
    />
  );
});
