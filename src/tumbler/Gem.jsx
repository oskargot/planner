import { useMemo } from 'react';
import { gemGeometry, facetFill, pts, SPECIES_BY_KEY, gemLabel } from './gems.js';

/*
 * One gem, drawn. Everything is stroked in the theme's ink and filled from
 * accent tokens via color-mix, so Mono flattens a gem the same way it flattens
 * the awning — the shape and the label still say which stone it is, which is
 * the rule about nothing meaningful living in decoration.
 */
export default function Gem({ gem, size = 64, title }) {
  const geo = useMemo(() => gemGeometry(gem), [gem.seed, gem.species, gem.grade]);
  const species = SPECIES_BY_KEY[gem.species];
  const label = title ?? gemLabel(gem);

  return (
    <svg
      className={`gem${species?.rare ? ' rare' : ''}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
    >
      {geo.facets.map((f, i) => (
        <polygon
          key={i}
          points={pts(f.points)}
          fill={facetFill(gem, f.tone)}
          stroke="var(--gem-edge)"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      ))}
      <polygon
        points={pts(geo.table)}
        fill={facetFill(gem, geo.tableTone)}
        stroke="var(--gem-edge)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {geo.inclusions.map((inc, i) => (
        <circle key={i} cx={inc.cx} cy={inc.cy} r={inc.r} fill="var(--gem-inclusion)" />
      ))}
      {/* Girdle last so it sits over every facet edge and reads as one solid
          silhouette rather than a bag of polygons. */}
      <polygon
        points={pts(geo.outer)}
        fill="none"
        stroke="var(--gem-edge)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
