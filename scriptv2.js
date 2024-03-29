//set canvas to window size
var h;
var w;

if ( typeof( DeviceMotionEvent ) !== "undefined" && typeof( DeviceMotionEvent.requestPermission ) === "function" ) {
	// (optional) Do something before API request prompt.
	DeviceMotionEvent.requestPermission()
		.then( response => {
		// (optional) Do something after API prompt dismissed.
		if ( response == "granted" ) {
			window.addEventListener( "devicemotion", (e) => {
				// do something for 'e' here.
			})
		}
	})
		.catch( console.error )
} else {
	//alert( "DeviceMotionEvent is not defined" );
}

// this class describes the properties of a single particle.
class Particle {
	// setting the co-ordinates, radius and the
	// speed of a particle in both the co-ordinates axes.
	constructor() {
		this.x = random(0,width);
		this.y = random(0,height);
		this.r = random(1,8);
		this.xSpeed = random(-2,2);
		this.ySpeed = random(-1,1.5);
	}

	// creation of a particle.
	createParticle() {
		noStroke();
		fill('rgba(200,169,169,0.5)');
		circle(this.x,this.y,this.r);
	}

	// setting the particle in motion.
	moveParticle() {
		if(this.x < 0 || this.x > width)
			this.xSpeed*=-1;
		if(this.y < 0 || this.y > height)
			this.ySpeed*=-1;
		this.x+=this.xSpeed;
		this.y+=this.ySpeed;
	}

	// this function creates the connections(lines)
	// between particles which are less than a certain distance apart
	joinParticles(particles) {
		particles.forEach(element =>{
			let dis = dist(this.x,this.y,element.x,element.y);
			if(dis<135) {
			stroke('rgba(255,255,255,0.2)');
			line(this.x,this.y,element.x,element.y);
			}
		});
	}
}

// an array to add multiple particles
let particles = [];

function isMobileDevice() {
    let userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /iPhone|iPad|iPod|Android/i.test(userAgent);
}

function setup() {
	console.log(isMobileDevice())
	if (isMobileDevice()) {
		canvas = createCanvas(windowWidth, windowHeight);
		pixelDensity(1);
	} else {
		canvas = createCanvas(screen.width, screen.height * 1.2);
	}

	canvas.parent("canv")
	for(let i = 0;i<width/10;i++){
		particles.push(new Particle());
	}
}

function draw() {
	background('#0f0f0f');
	for(let i = 0;i<particles.length;i++) {
		particles[i].createParticle();
		particles[i].moveParticle();
		particles[i].joinParticles(particles.slice(i));
	}
}
	

/*window.onresize = function() {
	h = window.innerHeight * 1.2;
	w = window.innerWidth;
	canvas.resize(w, h);
}*/