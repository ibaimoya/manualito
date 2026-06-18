import {
  imagePointRatio,
  imageZoomWidth,
  imageZoomLabel,
  nextImageZoom,
  previousImageZoom,
  scrollDeltaForImagePoint,
} from '@/features/manual/imageZoom';

describe('imageZoom', () => {
  it('calcula el punto relativo de la imagen y el scroll necesario para conservarlo', () => {
    const ratio = imagePointRatio(
      { left: 100, top: 50, width: 400, height: 600 },
      { clientX: 300, clientY: 200 },
    );
    expect(ratio).toEqual({ x: 0.5, y: 0.25 });

    const delta = scrollDeltaForImagePoint({ left: 80, top: 40, width: 800, height: 1200 }, ratio, {
      clientX: 300,
      clientY: 200,
    });
    expect(delta).toEqual({ left: 180, top: 140 });
  });

  it('limita ratios fuera de imagen y recorre niveles de zoom discretos', () => {
    expect(
      imagePointRatio({ left: 10, top: 10, width: 100, height: 100 }, { clientX: 0, clientY: 150 }),
    ).toEqual({ x: 0, y: 1 });
    expect(imageZoomLabel('fit')).toBe('Zoom');
    expect(imageZoomLabel(1.25)).toBe('125%');
    expect(imageZoomLabel(1.5)).toBe('150%');
    expect(imageZoomWidth(1.5, 800)).toBe('1200px');
    expect(nextImageZoom('fit')).toBe(1.25);
    expect(nextImageZoom(1.25)).toBe(1.5);
    expect(previousImageZoom(1)).toBe('fit');
  });
});
