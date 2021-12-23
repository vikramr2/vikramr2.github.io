//set canvas to window size
var h;
var w;

var frame = 0;

//initialize canvas
function setup() {
	h = windowHeight;
	w = windowWidth;
  let cnv = createCanvas(w, h);
  cnv.parent("canv")
}

//updating function
function draw() {
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

	line(0, 2*h/3, w, 2*h/3);

	for (var i = 0; i < w/2; i += 50) {
		line(w/2 - i, 2*h/3, w/2 - 2*i, h)
	} 

	for (var i = 0; i < w/2; i += 50) {
		line(w/2 + i, 2*h/3, w/2 + 2*i, h)
	} 

	for (var i = 2*h/3 + (frame % 50); i < h; i += 50) {
		line(0, i, w, i);
	}

	frame++; 
}