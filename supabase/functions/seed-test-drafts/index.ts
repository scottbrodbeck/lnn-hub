import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting seed-test-drafts function");

    const { site_id } = await req.json();

    if (!site_id) {
      return new Response(
        JSON.stringify({ error: "site_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Test Client user ID
    const testClientId = "11ac18b5-cef9-47ae-b4ff-c91ee3076591";

    // Get Test Client's default logo
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_logo_url")
      .eq("id", testClientId)
      .single();

    const logoUrl = profile?.default_logo_url || null;

    // Helper function to generate an image
    const generateImage = async (prompt: string): Promise<string> => {
      console.log(`Generating image: ${prompt}`);
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        throw new Error(`Image generation failed: ${response.status}`);
      }

      const data = await response.json();
      const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      
      if (!imageUrl) {
        throw new Error("No image URL in response");
      }

      return imageUrl;
    };

    // Helper function to upload image to storage
    const uploadImage = async (
      base64Data: string,
      filename: string
    ): Promise<{ url: string; path: string }> => {
      console.log(`Uploading image: ${filename}`);
      
      // Remove data URL prefix
      const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Uint8Array.from(atob(base64Clean), (c) => c.charCodeAt(0));

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("editor-images")
        .upload(filename, imageBuffer, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from("editor-images")
        .getPublicUrl(uploadData.path);

      return { url: publicUrlData.publicUrl, path: uploadData.path };
    };

    // Helper function to create image upload record
    const createImageRecord = async (
      url: string,
      path: string,
      filename: string,
      caption?: string
    ) => {
      console.log(`Creating image record: ${filename}`);
      const { error } = await supabase.from("image_uploads").insert({
        public_url: url,
        storage_path: path,
        original_filename: filename,
        caption: caption || null,
        is_in_use: true,
      });

      if (error) {
        console.error("Error creating image record:", error);
      }
    };

    // Draft post templates
    const postTemplates = [
      {
        headline: "New Italian Restaurant Brings Authentic Tuscan Cuisine to Ballston",
        content: `<p>A taste of Tuscany has arrived in Arlington. <strong>Trattoria Bella Vista</strong>, a new Italian restaurant, opened its doors last week in the heart of Ballston, bringing authentic regional Italian cuisine to the neighborhood.</p>

<p>The restaurant is the brainchild of Chef Marco Rossini, a native of Florence who trained at the prestigious Culinary Institute of Florence before working in Michelin-starred restaurants across Italy.</p>

<p>"We wanted to create an authentic Italian dining experience that showcases the best of Tuscan cooking," said Rossini. "Every dish is made from scratch using traditional techniques and the finest ingredients, many imported directly from Italy."</p>

<p>The menu features classic Tuscan dishes including handmade pasta, wood-fired pizzas, and slow-roasted meats. Signature dishes include the <em>pappardelle al cinghiale</em> (wide ribbon pasta with wild boar ragu) and the <em>bistecca alla fiorentina</em> (Florentine-style T-bone steak).</p>

<p>The restaurant's interior reflects the rustic elegance of a Tuscan farmhouse, with exposed brick walls, wooden beams, and warm lighting creating an intimate atmosphere. The space seats 75 guests, with an additional outdoor patio opening in the spring.</p>

<p>Trattoria Bella Vista is now open for dinner Tuesday through Sunday, with lunch service starting next month. Reservations are recommended and can be made through their website.</p>`,
        imagePrompt:
          "A beautiful Italian restaurant interior with rustic Tuscan decor, warm lighting, wooden tables, exposed brick walls, wine bottles on display. Ultra high resolution.",
        galleryPrompts: [
          "Delicious handmade pasta dish with wild boar ragu on a white plate, garnished with fresh herbs. Ultra high resolution food photography.",
          "Wood-fired pizza coming out of a traditional pizza oven with flames visible. Ultra high resolution.",
          "Elegant wine glasses and Italian wine bottles on a wooden table with candlelight. Ultra high resolution.",
        ],
        galleryCaptions: [
          "Signature pappardelle al cinghiale",
          "Fresh pizza from the wood-fired oven",
          "Curated selection of Italian wines",
        ],
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        pollData: {
          question: "What type of Italian cuisine do you enjoy most?",
          options: ["Pasta dishes", "Pizza", "Seafood", "Meat dishes"],
        },
        ctaButtonText: "Make a Reservation",
        ctaButtonUrl: "https://example.com/reservations",
        socialPosts: [
          "New Italian restaurant brings authentic Tuscan flavors to Ballston! 🍝🍷",
          "Arlington foodies: authentic Italian cuisine has arrived in Ballston with handmade pasta and wood-fired pizza.",
        ],
      },
      {
        headline: "Community Garden Celebrates 10th Anniversary with Harvest Festival",
        content: `<p>The Arlington Community Garden is celebrating a decade of growing together. This Saturday, the garden will host its 10th Anniversary Harvest Festival, marking ten years of bringing neighbors together to cultivate fresh produce and community spirit.</p>

<p>What started as a small plot of land with just eight gardeners has blossomed into a thriving green space with over 50 active members tending more than 40 raised beds. The garden produces thousands of pounds of fresh vegetables each year, with excess harvest donated to local food banks.</p>

<p>"The garden has become so much more than just a place to grow vegetables," said founding member Sarah Chen. "It's become a hub for our community, where people of all ages and backgrounds come together, share knowledge, and build lasting friendships."</p>

<p>Saturday's festival will feature <strong>garden tours, cooking demonstrations, live music, and activities for children</strong>. Local chefs will prepare dishes using produce from the garden, and master gardeners will be on hand to answer questions and share tips.</p>

<p>The event is free and open to the public, running from 10 AM to 4 PM. Organizers encourage attendees to bring reusable bags to take home fresh produce (donations accepted). There will also be a plant sale featuring seedlings and perennials grown by garden members.</p>

<p>"We invite everyone to come celebrate with us and see what we've built together over the past ten years," Chen added. "Whether you're an experienced gardener or just curious about growing your own food, there's something for everyone."</p>`,
        imagePrompt:
          "A vibrant community garden with raised beds full of vegetables, people of diverse ages gardening together, sunny day, flowers and greenery. Ultra high resolution.",
        galleryPrompts: [
          "Close-up of fresh harvested vegetables in a basket - tomatoes, peppers, lettuce, carrots. Ultra high resolution.",
          "Children planting seeds in a community garden, smiling and learning together. Ultra high resolution.",
          "Gardeners working together in raised garden beds on a sunny day. Ultra high resolution.",
        ],
        galleryCaptions: [
          "Fresh harvest from the garden",
          "Teaching the next generation",
          "Community members tending their plots",
        ],
        youtubeUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        pollData: {
          question: "Would you be interested in joining a community garden?",
          options: ["Yes, definitely!", "Maybe, need more info", "Not interested"],
        },
        ctaButtonText: "Learn More About the Garden",
        ctaButtonUrl: "https://example.com/community-garden",
        socialPosts: [
          "Arlington Community Garden turns 10! Join the celebration this Saturday 🌱🎉",
          "From 8 gardeners to 50+ members: see how this community garden has grown over the past decade.",
        ],
      },
      {
        headline: "Local Tech Startup Raises $5M to Expand AI-Powered Education Platform",
        content: `<p>An Arlington-based education technology startup has secured $5 million in Series A funding to expand its AI-powered learning platform. <strong>EduTech Solutions</strong>, founded in 2021, has developed an adaptive learning system that personalizes educational content for K-12 students.</p>

<p>The funding round was led by Northern Virginia Ventures, with participation from several prominent angel investors including former AOL executives and local tech entrepreneurs. The company plans to use the capital to expand its engineering team, enhance its AI capabilities, and scale its marketing efforts.</p>

<p>"We're solving a critical problem in education: every student learns differently, but traditional classroom instruction treats everyone the same," said co-founder and CEO Jennifer Park. "Our platform uses artificial intelligence to understand each student's learning style, pace, and knowledge gaps, then delivers personalized lessons that adapt in real-time."</p>

<p>The platform has already been adopted by over <strong>200 schools across Virginia, Maryland, and Washington D.C.</strong>, serving more than 50,000 students. Early results show promising improvements in student engagement and test scores, with participating schools reporting an average 15% increase in standardized test performance.</p>

<p>Teachers using the platform praise its ability to provide detailed insights into student progress while reducing time spent on administrative tasks. The system automatically generates assignments, grades responses, and identifies students who may need additional support.</p>

<p>"This funding validates our vision and allows us to accelerate our growth," Park said. "We're committed to making high-quality, personalized education accessible to every student, regardless of their background or zip code."</p>

<p>The company is currently hiring software engineers, data scientists, and sales professionals. EduTech Solutions is headquartered in Ballston, with plans to double its workforce to 40 employees by year-end.</p>`,
        imagePrompt:
          "Modern tech startup office with young diverse team collaborating around computers, bright and innovative workspace, glass walls, Arlington skyline visible. Ultra high resolution.",
        galleryPrompts: [
          "Students using tablets and computers for learning, engaged and smiling in a modern classroom. Ultra high resolution.",
          "Diverse startup team celebrating success, high-fiving and cheering in office. Ultra high resolution.",
          "Close-up of hands typing on laptop with AI dashboard and colorful data visualizations on screen. Ultra high resolution.",
        ],
        galleryCaptions: [
          "Students engaging with the platform",
          "The EduTech Solutions team",
          "AI-powered learning analytics",
        ],
        youtubeUrl: "https://www.youtube.com/watch?v=9bZkp7q19f0",
        pollData: {
          question: "Do you think AI will improve education?",
          options: ["Yes, significantly", "Somewhat helpful", "Not sure", "Concerns me"],
        },
        ctaButtonText: "Learn About EduTech Solutions",
        ctaButtonUrl: "https://example.com/edutech",
        socialPosts: [
          "Arlington startup secures $5M to bring personalized AI learning to more students 🎓💡",
          "EduTech Solutions is transforming K-12 education with AI. Here's how their platform is helping 50,000+ students learn better.",
        ],
      },
    ];

    console.log("Starting to generate posts...");

    for (let i = 0; i < postTemplates.length; i++) {
      const template = postTemplates[i];
      console.log(`Processing post ${i + 1}: ${template.headline}`);

      try {
        // Generate featured image
        const featuredImageData = await generateImage(template.imagePrompt);
        const featuredFilename = `test-draft-${i + 1}-featured-${Date.now()}.png`;
        const featuredImage = await uploadImage(featuredImageData, featuredFilename);
        await createImageRecord(
          featuredImage.url,
          featuredImage.path,
          featuredFilename,
          `Featured image for ${template.headline}`
        );

        // Generate gallery images
        const galleryImages = [];
        for (let j = 0; j < template.galleryPrompts.length; j++) {
          const galleryImageData = await generateImage(template.galleryPrompts[j]);
          const galleryFilename = `test-draft-${i + 1}-gallery-${j + 1}-${Date.now()}.png`;
          const galleryImage = await uploadImage(galleryImageData, galleryFilename);
          await createImageRecord(
            galleryImage.url,
            galleryImage.path,
            galleryFilename,
            template.galleryCaptions[j]
          );

          galleryImages.push({
            id: crypto.randomUUID(),
            url: galleryImage.url,
            caption: template.galleryCaptions[j],
          });
        }

        // Insert the post
        const { error: postError } = await supabase.from("posts").insert({
          client_id: testClientId,
          headline: template.headline,
          content: template.content,
          author_name: "Test Author",
          featured_image_url: featuredImage.url,
          gallery_images: galleryImages,
          logo_url: logoUrl,
          logo_link_url: "https://example.com",
          logo_author_name: "Test Author",
          youtube_url: template.youtubeUrl,
          poll_data: template.pollData,
          cta_button_text: template.ctaButtonText,
          cta_button_url: template.ctaButtonUrl,
          social_posts: template.socialPosts,
          status: "draft",
        });

        if (postError) {
          console.error(`Error inserting post ${i + 1}:`, postError);
        } else {
          console.log(`Successfully created post ${i + 1}`);
        }
      } catch (error) {
        console.error(`Error processing post ${i + 1}:`, error);
      }
    }

    console.log("Seed data generation complete");

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully created ${postTemplates.length} test drafts`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in seed-test-drafts:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
