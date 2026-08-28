interface SkeletonProps {
  /** Number of placeholder rows. */
  rows?: number;
}

/** Pulsing placeholder rows for async regions. */
function Skeleton({ rows = 3 }: SkeletonProps) {
  return (
    <div className="skeleton" aria-hidden="true" data-testid="skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index} />
      ))}
    </div>
  );
}

export default Skeleton;
