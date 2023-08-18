COPY (
    SELECT creator_id, slug, name, total_members 
    FROM groups 
    WHERE privacy_status ='private' 
    ORDER BY total_members DESC
) TO '/temp/output.csv' WITH CSV HEADER;

