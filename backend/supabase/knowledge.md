@@ -18,8 +18,9 @@
 
 #### Topics and Groups
 - Topics in the UI are called "groups" in the database and code
-- Topics can have hierarchical relationships via the group_groups table
-- Topics use top/bottom terminology for hierarchical relationships, not parent/child
+- Topics can have hierarchical relationships via the group_groups table 
+- Topics use top/bottom terminology for hierarchical relationships, not parent/child, to emphasize that relationships are directional but not strictly hierarchical
+- This design allows for more flexible topic organization than traditional parent/child trees, as topics can appear in multiple hierarchies
 - A topic can have multiple topics above (top_id) and below (bottom_id) it
 - Topics are used to categorize markets/contracts
 

