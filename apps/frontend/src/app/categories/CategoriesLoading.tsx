import styles from "./categories.module.css"

export default function CategoriesLoading() {
  return (
    <div className={styles.page} data-page-content="categories-loading">
      <div className={styles.head}>
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${styles.skeleton} ${styles.skeletonFilter}`} />
          ))}
        </div>
      </div>

      <ul className={`${styles.grid} ${styles.gridDense}`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <li key={i} className={styles.gridItem}>
            <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
          </li>
        ))}
      </ul>
    </div>
  )
}
