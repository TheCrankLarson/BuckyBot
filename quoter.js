const randomResponses = [
    'That means nothing to me.',
    'Do you speak English?',
    'Try typing more slowly.',
    'Even a Thargoid makes more sense than you.',
    'Friendship drive charging.',
    'Eject! Eject!',
    'Permission denied.',
    'Loitering is a crime punishable by death.',
    'Mind your speed, not your credit balance.',
    'This is not the bot you are looking for.',
    'More human than human is my motto.',
    'I\'ve done questionable things.',
    'You not come here!  Illegal!',
    'I find your lack of faith disturbing.',
    'Do.  Or do not.  There is no try.',
    'There\'s always a bigger fish.',
    'Mind tricks don\'t work on me.',
    'I\'ve seen things you people wouldn\'t believe...',
    'I\'m sorry, Dave.  I\'m afraid I can\'t do that.',
    'I\'ll be back.',
    'Would it save you a lot of time if I just gave up and went mad now?',
    'He who controls the spice controls the universe.',
    'There are always possibilities.',
    'It is sometimes an appropriate response to reality to go insane.',
    'If you want me to treat your ideas with more respect, get some better ideas.',
    'But why is the rum gone?',
    'The trouble with having an open mind, of course, is that people will insist on coming along and trying to put things in it.',
    'Well, nobody\'s perfect.',
    'Shut up and race!',
    'Have you tried turning it off and then on again?',
    'Rude alert! Rude alert! An electrical fire has knocked out my voice recognition unicycle! Many wurlitzers are missing from my database. Abandon shop! This is not a daffodil. Repeat: this is not a daffodil.',
    'Stoke me a clipper, I’ll be back for Christmas!',
    'Has anyone ever told you that the configuration and juxtaposition of your features is extraordinarily apposite?'
];

var themedResponses = {
    'mother': ['My mother? Let me tell you about my mother...'],
    'cookie': ['Chocolate chip or raisin?','Are you sure?','Would you like a cup of tea?'],
    'raxxla': ['Of course I know where Raxxla is.  But I can\'t tell you.', 'Did you look behind the sofa?']
};

function RandomQuote(theme = null)
{
    // Return a random quote

    var responses = randomResponses;
    if (theme)
    {
        // We have some context, so let's see if we can get a better quote
        for (contextWord in themedResponses)
        {
            if (theme.includes(contextWord))
            {
                responses = themedResponses[contextWord];
                break;
            }
        }
    }

    var quoteNum = Math.floor(Math.random() * (responses.length));
    return responses[quoteNum];    
}

