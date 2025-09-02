// parallax.js — desktop parallax + mobile static flag

const mq = window.matchMedia("(max-width: 767.98px)");

function setParallaxMode() {
  const isMobile = mq.matches;

  // Toggle a CSS flag for mobile-static styles
  document.documentElement.classList.toggle("parallax-mobile", isMobile);

  if (isMobile) {
    // Fully neutralize inline transforms on mobile
    document.querySelectorAll(".bg-layer").forEach(layer => {
      layer.style.transform = "none";
      layer.style.transition = "none";
    });
    return; // no JS parallax on mobile
  }

  // Desktop → apply parallax once on mode switch
  applyParallax();
}

function applyParallax() {
  const scrollY = window.scrollY;

  document.querySelectorAll(".bg-layer").forEach(layer => {
    const type  = layer.dataset.parallax || "default";
    const speed = parseFloat(layer.dataset.speed) || 0.3;

    if (type === "apartment-parallax") {
      const section = document.getElementById("apartment-section");
      const sectionTop = section ? section.offsetTop : 0;
      const local   = scrollY - sectionTop;
      const offsetY = local * speed;
      const scale   = Math.max(0.75, 1 - local * 0.0004);

      layer.style.transition = "transform 0.1s ease-out";
      layer.style.transform  =
        `translateX(-30%) rotate(-45deg) translateY(${offsetY}px) scale(${scale})`;

    } else if (type === "location-parallax") {
      const section = document.getElementById("location-section");
      const sectionTop = section ? section.offsetTop : 0;
      const local    = scrollY - sectionTop;
      const locSpeed = 0.5;
      const offsetY  = local * locSpeed;
      const rotation = -60 + local * 0.03;
      const scale    = Math.max(0.65, 0.8 - local * 0.0003);

      layer.style.transition = "transform 0.1s ease-out";
      layer.style.transform  =
        `translateX(-60%) translateY(${offsetY}px) rotate(${rotation}deg) scale(${scale})`;

    } else if (type === "small-shell") {
      const section = document.getElementById("location-section");
      const sectionTop = section ? section.offsetTop : 0;
      const local    = scrollY - sectionTop;
      const offsetY  = local * 0.3;
      const rotation = -local * 0.08;
      const scale    = 1 + local * 0.001;

      layer.style.transform = `translateX(0%) translateY(${offsetY}px) rotate(${rotation}deg) scale(${scale})`;

    } else {
      const offset = scrollY * speed;
      layer.style.transform = `translateY(${offset}px)`;
    }
  });
}

// Events
document.addEventListener("DOMContentLoaded", setParallaxMode);
window.addEventListener("scroll", () => { if (!mq.matches) applyParallax(); }, { passive: true });

// Keep the mode in sync when viewport changes
(mq.addEventListener ? mq.addEventListener("change", setParallaxMode)
                     : mq.addListener(setParallaxMode));
window.addEventListener("resize", setParallaxMode);
window.addEventListener("orientationchange", setParallaxMode);
