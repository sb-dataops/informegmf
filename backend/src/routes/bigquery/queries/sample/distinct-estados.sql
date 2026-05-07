SELECT IFNULL(estadoRetiro,'(null)') as val, COUNT(*) as cnt FROM `${tableName}` GROUP BY val ORDER BY cnt DESC LIMIT 20
