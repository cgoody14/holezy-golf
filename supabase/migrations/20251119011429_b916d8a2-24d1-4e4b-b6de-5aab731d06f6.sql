-- Add admin role for the current user
INSERT INTO public.user_roles (user_id, role) 
VALUES ('e676a393-3eb6-473e-a642-637a83165115', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;