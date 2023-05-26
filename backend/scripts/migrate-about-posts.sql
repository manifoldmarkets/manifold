create temp table
  abouts as (
    select
      id,
      group_id,
      data -> 'content' as about
    from
      posts
    where
      (data ->> 'isGroupAboutPost')::boolean = true
  );

update groups
set
  data = jsonb_set(data, '{about}', abouts.about)
from
  abouts
where
  abouts.group_id = groups.id;

delete from posts
where
  (data ->> 'isGroupAboutPost')::boolean = true
