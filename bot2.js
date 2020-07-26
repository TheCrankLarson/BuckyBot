const Discord = require('discord.io'); // https://github.com/Woor/discord.io/tree/gateway_v6  https://www.wikihow.com/Create-a-Bot-in-Discord
const auth = require('./auth.json');
const fetch = require('node-fetch');
const fs = require('fs');
const htmlparser2 = require("htmlparser2");
const eventsList = require("./events");
const quoter = require("./quoter");
const ships = require("./ships");

const eventsDataFile = "EventData2.json"; // Store event data in this file so that we don't need to download again when we start
const maxResultsReturned = 25; // Limited to the maximum number of fields in an embed object
var eventsWaitingUpdate = -1; // Keeps track of the number of events left to read
var readEventsReportChannel = null;

const respondTo = [
    'buckytest'
]; // The bot will respond to any messages that start with ! followed by one of these entries

const quickGifs = {};/*{
    'khan': 'https://cdn.discordapp.com/attachments/614734756520787988/732883141945196544/khan.gif',
    'bucky': 'https://media.giphy.com/media/D10hKcRT6JaLu/giphy.gif'
};*/



eventsList.RestoreFromFile(eventsDataFile);

function EventEmbed(event,includeImage=true)
{
    // Return an embed object for this event

    if (includeImage)
    {
        return  {
            title: event.name,
            description: event.date + ' - ' + event.author,
            url: event.infoUrl,
            color: 16711680,
            image: {
                url: event.bannerImage,
            },
        };
    }     
    return  {
        title: event.name,
        url: event.infoUrl,
        color: 16711680,
    };
}

function EventsEmbed(embedEvents,message = '')
{
    // Return an embed object for this event

    var eventName = '';
    var embedFields = [];
    console.log('Listing ' + embedEvents.length + ' events');
    for (i=0; i<embedEvents.length; i++)
    {
        eventName = '**[' + embedEvents[i].name + '](' + embedEvents[i].infoUrl + ")**";
        if (embedEvents[i].infoUrl.substring(0,4) != 'http')
            eventName = embedEvents[i].name;
        embedFields.push({name: embedEvents[i].date + ' - ' + embedEvents[i].author, value: eventName, inline: false});
    }

    return  {
        title: '',
        description: message,
        color: 16711680,
        url: '',
        fields: embedFields,
    };

}

function DisplayEventTest(event, channelID)
{
    // Display a single event
    const embed = {
        title: event.name,
        description: event.date + ' - ' + event.author,
        url: event.infoUrl,
        color: 16711680,
        thumbnail: {
          url: "https://media.discordapp.net/attachments/614735374400487435/614874757195890698/Buckyball_Transparent.png?width=300&height=300"
        },
        image: {
          url: event.bannerImage
        }
    };     

    if (event.bannerImage)
    {
        bot.sendMessage({
            to: channelID,
            embed: embed
        });
        return;    
    }
    bot.sendMessage({
        to: channelID,
        message: event.name + "\n<" + event.infoUrl + ">"
    }); 
}

function DisplayEvent(event, channelID)
{
    // Display a single event
    if (event.bannerImage)
    {
        bot.sendMessage({
            to: channelID,
            embed: EventEmbed(event)
        });
        return;    
    }
    bot.sendMessage({
        to: channelID,
        message: event.name + "\n<" + event.infoUrl + ">"
    }); 
}

function DisplayEvents(events, channelID)
{
    // Display a number of events (passed as an array)

    if (events.length == 1)
    {
        console.log('Events found: 1');
        DisplayEvent(events[0], channelID);
        return;
    }

    if (events.length>3)
    {
        var eventInfo = '';
        if (events.length>maxResultsReturned)
        {
            console.log('Too many events');
            eventInfo = 'Only showing first ' + maxResultsReturned + ' results of ' + events.length;
            while (events.length > maxResultsReturned)
                events.pop();
            //events = events.splice(maxResultsReturned);
        }

        bot.sendMessage({
            to: channelID,
            embed: EventsEmbed(events, eventInfo)
        });
        return;     
    }
    else
    {
        console.log('Events found: ' + events.length);
        for (i=0; i<events.length; i++)
        {
            bot.sendMessage({
                to: channelID,
                embed: EventEmbed(events[i])
            });
            //eventInfo += events[i].name + "\n<" + events[i].infoUrl + ">\n"
        }
    }  
}

// FindRaceIn function
function FindRaceIn(eventDate,channelID)
{
    // We are looking for a race that occurred during the specified date
    // We just do a dumb search on the forum content to find a match

    eventDate = eventDate.toLowerCase();

    var includeStandingChallenges = true;
    if (eventDate.length>5)
    {
        if (eventDate.substring(eventDate.length-5, eventDate.length) == ' only')
        {
            // Search excluding any standing challenges
            includeStandingChallenges = false;
            eventDate = eventDate.substring(0, eventDate.length-5);
        }
    }

    // Check for search month
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var searchMonth = -1;
    if (months.includes(eventDate.substring(0,3)))
    {
        // We are searching for a month
        searchMonth = months.indexOf(eventDate.substring(0,3));
    }
    if (eventDate == 'standing')
        searchMonth = 50; // Set to a month that cannot be found to just return the Standing Challenges

    // Check for search year - we'll use RegEx to extract any four digit number from our search string ^\d{4}$
    var searchYear = -1;
    var regEx = new RegExp('\\d{4}$');
    var yearMatches = eventDate.match(regEx);
    if (yearMatches)
    {
        if (yearMatches.length == 1)
            searchYear = Number(yearMatches[0]);
    }
    if (searchYear>-1 && searchYear<3000)
    {
        // The year has been passed in current day format.  Convert to E: D date
        // 2020 = 3306
        searchYear += 1286;
    }
    console.log('Search year: ' + searchYear);

    var foundEvent = false;
    if (events.length > 0)
    {
        // Loop through the events and find any that match
        var matchingEvents = [];
        for (i=0; i<events.length; i++)
        {
            var event = events[i];
            
            if (!event)
            {
                console.log('Unable to read event');
            }
            else if (!event.date)
            {
                console.log('Unable to read event date for event: ' + event.name);
            }
            else
            {
                if (event.date == 'Standing Challenge' || event.date == 'Now')
                {
                    if (includeStandingChallenges)
                    {
                        matchingEvents.push(event);
                        foundEvent = true;                    
                    }
                }
                else if (event.dateDate)
                {
                    var matchesMonth = (searchMonth==-1);
                    var matchesYear = (searchYear==-1);                    

                    var testDate = new Date(event.dateDate);

                    if (searchMonth>-1)
                    {
                        if (testDate.getMonth()==searchMonth)
                            matchesMonth = true;
                    }
                    if (searchYear>-1)
                    {
                        if (testDate.getFullYear()==searchYear)
                            matchesYear = true;
                    }


                    if (matchesMonth && matchesYear)
                    {
                        matchingEvents.push(event);
                        foundEvent = true;
                    }
                }
            }
        }
        if (foundEvent)
        {
            DisplayEvents(matchingEvents, channelID);
        }        
    }
    
    if (!foundEvent)
    {
        bot.sendMessage({
            to: channelID,
            message: 'No race found matching date criteria: in ' + eventDate
        });  
    }
}

function SendGIF(gifUrl, channelID, message = '')
{
    // Send GIF to channel as message attachment
    console.log(gifUrl);
    console.log(message);
    const gifEmbed = {
        title: '',
        description: '',
        image: {
            url: gifUrl,
        },
    };
    const msg = {
		type: 0,
		content: String(message),
		nonce: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
		embed: gifEmbed,
        attachments: []
    };

    bot.sendMessage({
        to: channelID,
        message: ':khan: What are you doing?!',
    });    
}

function ShowGIF(gifUrl, channelID, message = '')
{
    // Send GIF to channel
    const gifEmbed = {
        title: '',
        description: '',
        image: {
            url: gifUrl,
        },
        footer: {text: message},
    };
    bot.sendMessage({
        to: channelID,
        message: '',
        embed: gifEmbed
    });        
}



// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function () {
    console.log('Connected');
    console.log('Logged in as: ' + bot.username + ' (' + bot.id + ')');
});
bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`

    if ( user == 'BuckyBot')
    {
        // Don't respond to own messages
        return;
    }

    if (message.substring(0,1) != '!')
        return;
    loweredMessage = message.toLowerCase();
    
    for (quickGIF in quickGifs)
    {
        if (loweredMessage.substring(1, quickGIF.length+1) == quickGIF)
        {
            if (loweredMessage.length>quickGIF.length+1)
            {
                // There is more to the message
                if (loweredMessage.substring(quickGIF.length+1,quickGIF.length+2) == ' ')
                {
                    // We have a message to show as well
                    console.log('Matched GIF: ' + quickGIF);
                    ShowGIF(quickGifs[quickGIF], channelID, message.substring(quickGIF.length+2));
                    return;
                }
                // If we get here then this wasn't a GIF command, so we continue
            }
            else
            {
                console.log('Matched GIF: ' + quickGIF);
                ShowGIF(quickGifs[quickGIF], channelID);
                return;
            }
        }
    }

    // Check for any of the names we respond to
    var commandLength = -1;
    for (var i=0; i<respondTo.length; i++)
    {
        if (loweredMessage.length > respondTo[i].length+1)
        {
            if (loweredMessage.substring(1,respondTo[i].length+1) == respondTo[i])
            {
                commandLength = respondTo[i].length;
                break;
            }
        }
    }

    if (commandLength<0)
        return;
    console.log('Message received: ' + message);    
    
    var args = loweredMessage.substring(commandLength+2).split(' ');

    var cmd = args[0];
    if (cmd === 'find')
    {
        cmd = 'findrace';
        if (args[1] === 'race')
            args.splice(1,1);
    }

    switch(cmd) {
        // !buckybot bucky
        case 'ping':
            bot.sendMessage({
                to: channelID,
                message: 'Awaiting your command - type !buckybot help for list.'
            });
            break;

        // buckybot help
        case 'help':
            var gifCmds = '';
            for (gifCmd in quickGifs)
                gifCmds += '!' + gifCmd + ', ';
            if (gifCmds != '')
                gifCmds = gifCmds.substring(0, gifCmds.length-2);
            bot.sendMessage({
                to: channelID,
                message:    '!buckybot events\n' +
                            '!buckybot random\n' +                                                  
                            '!buckybot find active\n' +
                            '!buckybot find <word or phrase in title>\n' +
                            '!buckybot find with <keywords> ("enclose in quotes to match entire phrase")\n' +
                            '!buckybot find in <month> <year> (at least one must be specified, months should be in English text)\n' +
                            '!buckybot find by <author>\n' +                          
                            '!buckybot refresh\n' +                          
                            gifCmds
            });
            break;

        // !buckybot findrace
        case 'findrace':
            var searchWords = [];
            if (args[1])
                searchWords = args.slice(2);
            if ( (args[1] == 'at') || (args[1] == 'with') )
            {
                // !findrace at xxx triggers a search of the forum content (we assume that at is a place)
                DisplayEvents(eventsList.FindEventsByKeywords(searchWords));
            }
            else if (args[1] == 'by')
            {
                DisplayEvents(eventsList.FindEventsByAuthor(searchWords,join(' ')));
            }
            else if (args[1] == 'active')
            {
                DisplayEvents(eventsList.FindActiveEvents());
            }                         
            else
            {
                DisplayEvents(eventsList.FindEventsByTitle(searchWords,join(' ')));
            }
            break;

        case 'events':
            // Inform how many events the bot knows about
            bot.sendMessage({
                to: channelID,
                message: 'I know about ' + eventsList.events.length + ' events'
            });      
            break;

        case 'test':
            if (eventsList.events)
            {
                if (eventsList.events.length > 0)
                {
                    var eventNum = Math.floor(Math.random() * (eventsList.events.length));
                    DisplayEventTest(eventsList.events[eventNum], channelID);
                }
            }
            //SendGIF(quickGifs['khan'], channelID, 'Some message');
            break;

        case 'readevents':
        case 'refresh':
            // Read the events from past events channels
            readEventsReportChannel = channelID;
            ReadStandingChallenges();
            ReadEvents();
            break;

        case 'randomevent':
        case 'random':
            // Display a random event
            if (eventsList.events)
            {
                if (eventsList.events.length > 0)
                {
                    var eventNum = Math.floor(Math.random() * (eventsList.events.length));
                    DisplayEvent(eventsList.events[eventNum], channelID);
                }
            }
            break;

        default:
            // Check for GIF
            for (quickGIF in quickGifs)
            {
                if (cmd == quickGIF)
                {
                    console.log('Matched GIF: ' + quickGIF);
                    var gifMessage = '';
                    if (args[1])
                        gifMessage = message.substring(commandLength + quickGIF.length+2);                    

                    ShowGIF(quickGifs[quickGIF], channelID, gifMessage);
                    return;
                }
            } 
            
            // No GIF, so send random phrase
            var response = 'You could at least say something';
            if (args[0] != '')
                response = quoter.RandomQuote(args.join(' '));
            bot.sendMessage({
                to: channelID,
                message: response
            }); 
            break;
        }
});

bot.on('disconnect', function() {
    console.log('Disconnected');
});