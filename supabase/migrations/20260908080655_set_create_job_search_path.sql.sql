CREATE OR REPLACE FUNCTION create_job(p_name text, p_note text DEFAULT NULL)
RETURNS jobs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_job jobs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO jobs (user_id, name, note)
  VALUES (auth.uid(), p_name, p_note)
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION create_job(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_job(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_job(text, text) TO authenticated;
