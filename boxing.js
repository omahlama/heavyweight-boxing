var ROUND_LENGTH = 180, BREAK_LENGTH = 60, KO_LENGTH = 10;

var winner = new Bacon.Bus();
var timer = Bacon.interval(1000, 1).takeUntil(winner);
var players = [new Player(), new Player()]
var startMatch = new Bacon.Bus();

// Beer
var beerDifference = Bacon.combineWith(difference, players[0].beerCount, players[1].beerCount).log("Beer difference")
var leftCanKO = beerDifference.map(function(d) { return d >= 1 }).log("Left can KO")
var rightCanKO = beerDifference.map(function(d) { return d <= -1 }).log("Right can KO")
var leftKOTries = players[0].tryKO.filter(leftCanKO).map("Left")
var rightKOTries = players[1].tryKO.filter(rightCanKO).map("Right")
var KOTries = leftKOTries.merge(rightKOTries)

// KO Timer
var KOFailed = new Bacon.Bus()
var KOTimer = KOTries.flatMapLatest(function() {
	return timer.scan(0, sum).filter(function (time) { return time <= KO_LENGTH }).takeUntil(KOFailed);
});
var KOSuccess = KOTimer.filter(function (time) { return time === KO_LENGTH }).map(true)
var KOEnd = KOFailed.map(false).merge(KOSuccess)
var KOInProgress = KOTries.map(true).merge(KOEnd.map(false)).toProperty(false).log("KO in progress")

var koWinner = KOSuccess.map(KOTries.toProperty())

var matchTimer = timer.filter(KOInProgress.not())

// Time
var roundStart = new Bacon.Bus();
roundStart.plug(startMatch);
var roundTimer = roundStart.flatMapLatest(function() {
	return matchTimer.scan(0, sum).filter(function (time) { return time <= ROUND_LENGTH });
});
var roundEnd = roundTimer.filter(function (time) { return time === ROUND_LENGTH }).map(true); 

var breakTimer = roundEnd.flatMapLatest(function() {
	return matchTimer.scan(0, sum).filter(function (time) { return time <= BREAK_LENGTH });
});
var breakEnd = breakTimer.filter(function (time) { return time === BREAK_LENGTH }).map(true);
roundStart.plug(breakEnd);

var roundNumber = roundStart.map(1).scan(0, sum )

winner.plug(koWinner)
winner.plug(players[0].abandon.map("Right"))
winner.plug(players[1].abandon.map("Left"))

function Player() {
	this.drinkBeer = new Bacon.Bus();
	this.tryKO     = new Bacon.Bus();
	this.abandon   = new Bacon.Bus();
	this.beerCount = this.drinkBeer.scan(0, sum).log("Beer count");

	this.initUI = function(side) {
		this.drinkBeer.plug($("#"+side+"-beer").asEventStream("click").map(1))
		this.tryKO.plug($("#"+side+"-KO").asEventStream("click").map(true))
		this.abandon.plug($("#"+side+"-abandon").asEventStream("click").map(true))
		this.beerCount.onValue(function(count) { $("#"+side+"-beer-count").text(count) })
	}
}

function sum(a, b) { return a + b; }
function difference(a, b) { return a - b; }

roundEnd.log("Break starts")
roundNumber.log("Round starts:")
leftKOTries.log("Left KO try")
rightKOTries.log("Right KO try")

roundTimer.log("Round timer")
KOTimer.log("KO timer")

// UI

$(function() {
	var combinedTimer = roundTimer.merge(breakTimer)

	combinedTimer.onValue(function (time) {
		var min = Math.floor(time / 60)
		var sec = time % 60
		$("#timer").text(pad(min) + ":" + pad(sec))
	})

	players[0].initUI("left")
	players[1].initUI("right")

	leftCanKO.onValue(function(enable) { $("#left-KO").toggleClass("enabled", enable) })
	rightCanKO.onValue(function(enable) { $("#right-KO").toggleClass("enabled", enable) })

	roundNumber.onValue(function(round) { showOverLay("#round-start", "Round " + round)});
	roundEnd.onValue(function() { showOverLay("#break-start", "Break starts")});

	KOTries.onValue(function() { $("#ko-try").addClass("show") });
	KOTimer.onValue(function(time) { $("#ko-timer").text(time)})
	KOFailed.plug($("#ko-try").asEventStream("click").map(true))
	KOFailed.onValue(function() { $("#ko-try").removeClass("show")})

	winner.onValue(function(side) { $("#winner").html("<span>"+ side + " won!</span>").addClass("show") })

	startMatch.push(true);
})

function showOverLay(selector, text) {
	$(selector).html("<span>"+text+"</span>").addClass("show");
	setTimeout(function() { $(selector).removeClass("show") }, 2000)
}

function pad(str) {
	return ("0" + str).substr(-2)
}