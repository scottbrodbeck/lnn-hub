--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: post_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.post_status AS ENUM (
    'draft',
    'published',
    'archived'
);


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_table_access_method = heap;

--
-- Name: debug_paste_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debug_paste_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    raw_html text NOT NULL,
    raw_html_length integer,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    user_agent text,
    notes text
);


--
-- Name: image_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.image_uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    storage_path text NOT NULL,
    public_url text NOT NULL,
    original_filename text NOT NULL,
    file_size integer,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    is_in_use boolean DEFAULT false NOT NULL,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    headline text NOT NULL,
    author_name text,
    logo_url text,
    content text NOT NULL,
    youtube_url text,
    featured_image_url text,
    gallery_images jsonb,
    status public.post_status DEFAULT 'draft'::public.post_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone
);


--
-- Name: debug_paste_logs debug_paste_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debug_paste_logs
    ADD CONSTRAINT debug_paste_logs_pkey PRIMARY KEY (id);


--
-- Name: image_uploads image_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_uploads
    ADD CONSTRAINT image_uploads_pkey PRIMARY KEY (id);


--
-- Name: image_uploads image_uploads_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_uploads
    ADD CONSTRAINT image_uploads_storage_path_key UNIQUE (storage_path);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: idx_debug_paste_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debug_paste_logs_timestamp ON public.debug_paste_logs USING btree ("timestamp" DESC);


--
-- Name: idx_image_uploads_is_in_use; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_uploads_is_in_use ON public.image_uploads USING btree (is_in_use);


--
-- Name: idx_image_uploads_public_url; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_uploads_public_url ON public.image_uploads USING btree (public_url);


--
-- Name: idx_image_uploads_uploaded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_uploads_uploaded_at ON public.image_uploads USING btree (uploaded_at);


--
-- Name: idx_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_created_at ON public.posts USING btree (created_at);


--
-- Name: idx_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_status ON public.posts USING btree (status);


--
-- Name: image_uploads update_image_uploads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_image_uploads_updated_at BEFORE UPDATE ON public.image_uploads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: posts update_posts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: debug_paste_logs Anyone can insert debug logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert debug logs" ON public.debug_paste_logs FOR INSERT WITH CHECK (true);


--
-- Name: debug_paste_logs Anyone can view debug logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view debug logs" ON public.debug_paste_logs FOR SELECT USING (true);


--
-- Name: image_uploads Public can insert images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can insert images" ON public.image_uploads FOR INSERT WITH CHECK (true);


--
-- Name: posts Public can insert posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can insert posts" ON public.posts FOR INSERT WITH CHECK (true);


--
-- Name: posts Public can update posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can update posts" ON public.posts FOR UPDATE USING (true);


--
-- Name: image_uploads Public can view images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view images" ON public.image_uploads FOR SELECT USING (true);


--
-- Name: posts Public can view posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view posts" ON public.posts FOR SELECT USING (true);


--
-- Name: debug_paste_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debug_paste_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: image_uploads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.image_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


