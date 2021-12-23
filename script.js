//set canvas to window size
var h;
var w;

var frame = 0;
console.log("Change");

//initialize canvas
function setup() {
	h = window.innerHeight * 1.2;
	w = window.innerWidth;
  	canvas = createCanvas(w, h);
  	canvas.parent("canv")
}

//updating function
function draw() {
	console.log(w, h);
	background(255, 255, 255);

	bottomColor = [255, 184, 219]
	remColor = [181 - 255, 204 - 184, 255 - 219]

	for (var i = 0; i < h; i++) {
		midColor = [bottomColor[0] + remColor[0]*i/h, bottomColor[1] + remColor[1]*i/h, bottomColor[2] + remColor[2]*i/h]
		stroke(color(midColor[0], midColor[1], midColor[2]))
		strokeWeight(1);
		line(0, i, w, i)
	}

	stroke(color(255, 255, 255));
	//strokeWeight(4);

	line(0, 2*(h/1.2)/3, w, 2*(h/1.2)/3);

	for (var i = 0; i < w/2; i += 50) {
		line(w/2 - i, 2*(h/1.2)/3, w/2 - 2*i, h)
	} 

	for (var i = 0; i < w/2; i += 50) {
		line(w/2 + i, 2*(h/1.2)/3, w/2 + 2*i, h)
	} 

	for (var i = 2*(h/1.2)/3 + (frame % 50); i < h; i += 50) {
		line(0, i, w, i);
	}

	frame++; 
}

window.onresize = function() {
	h = window.innerHeight * 1.2;
	w = window.innerWidth;
	canvas.resize(w, h);
}